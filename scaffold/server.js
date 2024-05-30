require('dotenv').config();
const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const fs = require('fs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


const DATABASE_PATH = process.env.DATABASE_PATH;
const SESSION_SECRET = process.env.SESSION_SECRET;
const EMOJI_API_KEY = process.env.EMOJI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const app = express();
const PORT = 3000;

async function openDatabase() {
    return open({
        filename: DATABASE_PATH,
        driver: sqlite3.Database
    });
}

module.exports = { openDatabase };

passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    // Hash the Google ID
    const hashedGoogleId = crypto.createHash('sha256').update(profile.id).digest('hex');
    console.log('Hashed Google ID:', hashedGoogleId); // Debugging line
    return done(null, { profile, hashedGoogleId });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

async function checkDatabase() {
    const db = await openDatabase();
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users';");
    if (!tableExists) {
        console.error("Database is not properly set up. Run populatedb.js to initialize the database.");
        process.exit(1); // Exit the process with an error code
    }
    return db;
}

async function startServer() {
    try {
        const db = await openDatabase();
        app.locals.db = db;

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to the database:', error);
    }
}

startServer();

// Set up Handlebars view engine with custom helpers
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: SESSION_SECRET,     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);


app.use(passport.initialize());
app.use(passport.session());

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)


// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use(async(req, res, next) => {
    res.locals.appName = 'ShareStuff';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';

    // If the user is logged in, fetch additional details
    if (res.locals.loggedIn && res.locals.userId) {
        const user = await findUserById(res.locals.userId); 
        if (user) {
            res.locals.username = user.username;
            res.locals.avatar_url = user.avatar_url || '/images/default.png'; // Provide a default if none is set
        }
    }

    next();
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    try {
        const posts = await getPosts();
        const user = await getCurrentUser(req) || null;

        // Attach the avatar URL and edit permissions to each post
        for (let post of posts) {
            // Ensure username is a string here
            post.username = String(post.username);
            const postUser = await app.locals.db.get("SELECT * FROM users WHERE username = ?", post.username);
            post.avatar_url = postUser ? postUser.avatar_url : null;
            post.userCanEdit = user && post.username === user.username;

            // Check if the user has liked the post
            if (user) {
                const userLike = await app.locals.db.get("SELECT * FROM likes WHERE userId = ? AND postId = ?", [user.id, post.id]);
                post.userHasLiked = !!userLike;
            }
        }

        res.render('home', {
            posts,
            user,
            loggedIn: !!req.session.userId,
            EMOJI_API_KEY
        });
    } catch (error) {
        console.error('Failed to load posts or user data:', error);
        res.render('error', { message: 'Failed to load data.' });
    }
});

// Serve the Terms of Service HTML file
app.get('/terms-of-service.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Serve the Privacy Policy HTML file
app.get('/privacy-policy.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

// Google OAuth login route
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

// Google OAuth callback route
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), async (req, res) => {
    const { profile, hashedGoogleId } = req.user; // Get the hashed Google ID from the user profile processed by passport
    req.session.hashedGoogleId = hashedGoogleId; // Store the hashedGoogleId in the session

    const db = app.locals.db;
    const user = await db.get("SELECT * FROM users WHERE hashedGoogleId = ?", [hashedGoogleId]);

    if (user) {
        // User exists, log them in
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        // User does not exist, redirect to username registration
        res.redirect('/registerUsername');
    }
});

// Route to render the username registration page
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { error: req.query.error });
});

// Route to handle the username registration form submission
app.post('/registerUsername', async (req, res) => {
    console.log('Received request to register username:', req.body.username); // Debugging line
    await registerUser(req, res);
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/googleLogout');
    });
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

app.get('/logoutCallback', (req, res) => {
    res.render('logoutCallback');
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement


app.get('/post/:id', (req, res) => {
    // TODO: Render post detail page
});

app.post('/posts', async (req, res) => {
    // Add a new post and redirect to home
    const { title, content } = req.body;
    const user = await findUserById(req.session.userId);
    if (user) {
        console.log('Creating post with username:', user.username); // Log the username
        await addPost(title, content, user.username);
        res.redirect('/');
    } else {
        res.status(403).send('You must be logged in to post.');
    }
});

app.post('/like/:id', async (req, res) => {
    await updatePostLikes(req, res);
});


app.get('/profile', isAuthenticated, (req, res) => {
    // TODO: Render profile page
    renderProfile(req, res);
});

app.get('/avatar/:username', async (req, res) => {
    try {
        const user = await findUserByUsername(req.params.username);
        if (user) {
            const firstLetter = user.username[0].toUpperCase();
            const avatar = generateAvatar(firstLetter);
            const avatarFilename = `${req.params.username}.png`;
            const avatarPath = path.join(__dirname, 'public', 'images', avatarFilename);
            const relativeAvatarPath = path.join('images', avatarFilename);

            fs.writeFileSync(avatarPath, avatar);

            // Update the avatar_url in the database with a relative path
            const db = app.locals.db;
            await db.run("UPDATE users SET avatar_url = ? WHERE username = ?", [relativeAvatarPath, user.username]);

            res.type('png').send(avatar);
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('Error fetching avatar:', error);
        res.status(500).send('Internal server error');
    }
});

app.get('/posts/:id/comments', async (req, res) => {
    const postId = parseInt(req.params.id);
    const db = app.locals.db;

    try {
        const comments = await db.all("SELECT * FROM comments WHERE postId = ? ORDER BY timestamp ASC", [postId]);
        res.status(200).json(comments);
    } catch (error) {
        console.error('Error retrieving comments:', error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

app.post('/posts/:id/comments', async (req, res) => {
    const postId = parseInt(req.params.id);
    const { content } = req.body;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(403).json({ success: false, message: "You must be logged in to comment." });
    }

    const user = await findUserById(userId);

    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    const db = app.locals.db;
    const timestamp = new Date().toISOString();

    try {
        await db.run(
            "INSERT INTO comments (postId, username, content, timestamp) VALUES (?, ?, ?, ?)",
            [postId, user.username, content, timestamp]
        );

        res.status(200).json({ success: true, message: "Comment added successfully." });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});


app.post('/register', (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);
    console.log('Registeration complete');
});

app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});

app.delete('/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const userId = req.session.userId;

        const db = app.locals.db;

        // Fetch the current user's username
        const user = await db.get("SELECT username FROM users WHERE id = ?", userId);

        if (!user) {
            return res.status(403).json({ message: "User not found" });
        }

        const { username } = user;

        // Fetch the post to ensure the current user is the owner
        const post = await db.get("SELECT * FROM posts WHERE id = ?", postId);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        if (post.username !== username) {
            return res.status(403).json({ message: "You are not authorized to delete this post" });
        }

        // Delete the post from the database
        await db.run("DELETE FROM posts WHERE id = ?", postId);

        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


// Function to find a user by username
async function findUserByUsername(username) {
    const db = app.locals.db;
    return await db.get("SELECT * FROM users WHERE username = ?", [username]);
}

// Function to find a user by user ID
async function findUserById(userId) {
    const db = app.locals.db;
    return await db.get("SELECT * FROM users WHERE id = ?", [userId]);
}

function calculateDate(){
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    // console.log(req.session.userId);
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
async function registerUser(req, res) {
    const { username } = req.body;
    const hashedGoogleId = req.session.hashedGoogleId; 

    if (!hashedGoogleId) {
        return res.redirect('/auth/google'); 
    }

    try {
        const db = app.locals.db;
        const userExists = await db.get("SELECT * FROM users WHERE username = ?", [username]);
        if (userExists) {
            res.redirect('/registerUsername?error=Username+already+exists');
        } else {
            // Generate avatar
            const avatar = generateAvatar(username[0].toUpperCase());
            const avatarFilename = `${username}.png`;
            const avatarPath = path.join(__dirname, 'public', 'images', avatarFilename);
            const relativeAvatarPath = path.join('images', avatarFilename);

            fs.writeFileSync(avatarPath, avatar);

            await db.run("INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)", [username, hashedGoogleId, relativeAvatarPath, new Date().toISOString()]);
            const newUser = await db.get("SELECT * FROM users WHERE username = ?", [username]);
            req.session.userId = newUser.id;
            req.session.loggedIn = true;
            res.redirect('/');
        }
    } catch (error) {
        console.error("Database error:", error);
        res.redirect('/registerUsername?error=Unexpected+Error');
    }
}

// Google OAuth callback route
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), async (req, res) => {
    const { profile, hashedGoogleId } = req.user; // Get the hashed Google ID from the user profile processed by passport
    req.session.hashedGoogleId = hashedGoogleId; // Store the hashedGoogleId in the session

    const db = app.locals.db;
    const user = await db.get("SELECT * FROM users WHERE hashedGoogleId = ?", [hashedGoogleId]);

    if (user) {
        // User exists, check if they have an avatar
        if (!user.avatar_url) {
            // Generate avatar
            const avatar = generateAvatar(user.username[0].toUpperCase());
            const avatarFilename = `${user.username}.png`;
            const avatarPath = path.join(__dirname, 'public', 'images', avatarFilename);
            const relativeAvatarPath = path.join('images', avatarFilename);

            fs.writeFileSync(avatarPath, avatar);

            // Update the avatar_url in the database
            await db.run("UPDATE users SET avatar_url = ? WHERE id = ?", [relativeAvatarPath, user.id]);
        }
        // Log the user in
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        // User does not exist, redirect to username registration
        res.redirect('/registerUsername');
    }
});


// Function to logout a user
function logoutUser(req, res) {
    req.session.destroy(() => {
        res.redirect('/');
    })
}

// Function to render the profile page
async function renderProfile(req, res) {
    try {
        const db = app.locals.db;
        const user = await findUserById(req.session.userId);
        if (user) {
            // Fetch posts from the database where the username matches the logged-in user's username
            const userPosts = await db.all("SELECT * FROM posts WHERE username = ?", user.username);

            // Add a property to each post to indicate that the user can edit their own posts
            userPosts.forEach(post => post.userCanEdit = true);

            // console.log(userPosts);
            res.render('profile', { user, posts: userPosts, postNeoType: 'Post'});
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.render('error', { message: 'Error loading profile page.' });
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id);
    const userId = req.session.userId;

    if (!userId) {
        return res.status(403).json({ success: false, message: "You must be logged in to like posts." });
    }

    const db = app.locals.db;
    try {
        // Fetch the post
        const post = await db.get("SELECT * FROM posts WHERE id = ?", postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Prevent users from liking their own posts
        if (post.username === (await findUserById(userId)).username) {
            return res.status(400).json({ success: false, message: "You cannot like your own post." });
        }

        // Check if the user has already liked the post
        const userLike = await db.get("SELECT * FROM likes WHERE userId = ? AND postId = ?", [userId, postId]);

        if (userLike) {
            // User has liked the post, so unlike it
            await db.run("DELETE FROM likes WHERE userId = ? AND postId = ?", [userId, postId]);
            await db.run("UPDATE posts SET likes = likes - 1 WHERE id = ?", postId);
            post.likes -= 1; // Decrement the likes count
        } else {
            // User has not liked the post, so like it
            await db.run("INSERT INTO likes (userId, postId) VALUES (?, ?)", [userId, postId]);
            await db.run("UPDATE posts SET likes = likes + 1 WHERE id = ?", postId);
            post.likes += 1; // Increment the likes count
        }

        res.json({ success: true, likes: post.likes });
    } catch (error) {
        console.error('Error updating post likes:', error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
}

// Function to get the current user from session
async function getCurrentUser(req) {
    const db = app.locals.db;
    if (req.session.userId) {
        return await db.get("SELECT * FROM users WHERE id = ?", req.session.userId);
    }
    return null;
}

// Function to get all posts, sorted by latest first
async function getPosts() {
    const db = app.locals.db;
    return await db.all("SELECT * FROM posts ORDER BY timestamp DESC");
}

// Function to add a new post
async function addPost(title, content, username) {
    const db = app.locals.db;
    const date = calculateDate();
    console.log('Adding post to database with username:', username); // Log the username
    await db.run(
        "INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, 0)",
        [title, content, username, date]
    );
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.font = '45px Arial';
    ctx.fillText(letter, width / 3, height / 1.5);
    return canvas.toBuffer();
}