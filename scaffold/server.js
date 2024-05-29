const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const fs = require('fs');
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
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
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'ShareStuff';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';

    // If the user is logged in, fetch additional details
    if (res.locals.loggedIn && res.locals.userId) {
        const user = findUserById(res.locals.userId); // This function needs to be defined to fetch user data
        if (user) {
            res.locals.username = user.username;
            res.locals.avatar_url = user.avatar_url || '/images/default.png'; // Provide a default if none is set
        }
    }

    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user });
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

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement


app.get('/post/:id', (req, res) => {
    // TODO: Render post detail page
});
app.post('/posts', (req, res) => {
    // TODO: Add a new post and redirect to home
    const {title, content} = req.body;
    const user = findUserById(req.session.userId);
    if(user){
        addPost(title, content, user);
        res.redirect('/');
    } else {
        res.status(403).send('You must be logged in to post.');
    }
});

app.post('/like/:id', (req, res) => {
    updatePostLikes(req, res);
});

app.get('/profile', isAuthenticated, (req, res) => {
    // TODO: Render profile page
    renderProfile(req, res);
});
app.get('/avatar/:username', (req, res) => {
    // TODO: Serve the avatar image for the user
    const user = findUserByUsername(req.params.username);
    if(user){
        const firstLetter = user.username[0].toUpperCase();
        const avatar = generateAvatar(firstLetter);
        user.avatar_url = `${__dirname}/public/images/${req.params.username}.png`;
        fs.writeFileSync(user.avatar_url, avatar);
        //console.log(user.avatar_url);
        res.type('png').send(avatar);
    } else {
        res.status(404).send('User not found');
    }
    // save the image
    // const path = `${__dirname}/public${avatar}`
});
app.post('/register', (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);
    console.log('Registeration complete');
    // TODO: delete code below
    // console.log(users);
});
app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});
app.post('/delete/:id', isAuthenticated, (req, res) => {
    // TODO: Delete a post if the current user is the owner
    const postId = parseInt(req.params.id);
    const userId = req.session.userId; 
    const postIndex = posts.findIndex(p => p.id === postId && p.userId === userId);
    if (postIndex === -1) {
        return res.status(404).json({ message: "Post not found or user not authorized to delete this post" });
    }

    posts.splice(postIndex, 1);

    res.status(200).json({ message: "Post deleted successfully" });
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    { 
        id:         1, 
        title:      'Sample Post', 
        content:    'This is a sample post.', 
        username:   'SampleUser',
        userId:     1, 
        timestamp:  '2024-01-01 10:00', 
        likes:      0 
    },
    { 
        id:         2, 
        title:      'Another Post', 
        content:    'This is another sample post.', 
        username:   'AnotherUser',
        userId:     2, 
        timestamp:  '2024-01-02 12:00', 
        likes:      0 
    },
];
let users = [
    { 
        id:             1,
        username:       'SampleUser',
        password:       'sss',
        avatar_url:     '/images/SampleUser.png',
        memberSince:    '2024-01-01 08:00' },
    { 
        id:             2,
        username:       'AnotherUser',
        password:       'sss',
        avatar_url:     '/images/AnotherUser.png',
        memberSince:    '2024-01-02 09:00' },
];
let likes = [];

// Function to find a user by username
function findUserByUsername(username) {
    // TODO: Return user object if found, otherwise return undefined
    return users.find((user) => {
        return user.username === username
    });
}

// Function to find a user by user ID
function findUserById(userId) {
    // TODO: Return user object if found, otherwise return undefined
    return users.find((user) => {
        return user.id === parseInt(userId);
    });
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

// Function to add a new user
function addUser(username, password) {
    // TODO: Create a new user object and add to users array
    const completeDate = calculateDate();
    // Find the highest current user ID and add 1 to it
    let maxId = users.reduce((max, user) => Math.max(max, user.id), 0);
    let newUser = {
        id: maxId + 1,
        username: username,
        password: password,
        avatar_url: undefined,
        memberSince: completeDate
    };

    users.push(newUser);  // Add the new user to the array
    return newUser;
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    console.log(req.session.userId);
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    const username = req.body.username;
    const password = req.body.password;
    console.log(`Creating account for: ${username}`);
    // TODO: check if user has an account. 
    // if yes, error, if no, add user and reducrect back to login
    if(findUserByUsername(username)){
        res.redirect('/register?error=Username+already+exists');
    } else {
        addUser(username, password);
        res.redirect('/login');
    }
}

// Function to login a user
function loginUser(req, res) {
    // TODO: Login a user and redirect appropriately
    const {username, password} = req.body;
    const user = findUserByUsername(username);
    if (user && user.password === password){
        req.session.userId = user.id;
        req.session.loggedIn = true;
        console.log(`${username} logged in at ${calculateDate()}`);
        res.redirect('/');
    } else {
        res.redirect('/login?error=Invalid+credentials');
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy(() => {
        res.redirect('/');
    })
}

// Function to render the profile page
function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
    const user = findUserById(req.session.userId);
    if (user) {
        // filter creates a new array with elements that pass
        // a criteria
        const userPosts = posts.filter(post => post.username === user.username).map(post => ({
            ...post,
            userCanEdit: post.username === user.username
        }));
        console.log(userPosts);
        res.render('profile', { user, posts: userPosts, postNeoType: 'Post'});
    } else {
        res.redirect('/login');
    }
}

// Function to update post likes
function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
    const postId = parseInt(req.params.id);
    const userId = req.session.userId;

    if (!userId) {
        return res.status(403).json({ success: false, message: "You must be logged in to like posts." });
    }

    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
    }

    if (post.userId === req.session.userId) {
        //return res.status(400).json({ success: false, message: "You cannot like your own post" });
        console.log(`User ${userId} tried to like their own post`);
        return res.end();
    }

    // Check if the user has already liked the post
    const likeIndex = likes.findIndex(like => like.userId === userId && like.postId === postId);
    if (likeIndex !== -1) {
        // User has liked the post, so unlike it
        likes.splice(likeIndex, 1); // Remove the like from the array
        post.likes -= 1; // Decrement the likes count
    } else {
        // User has not liked the post, so like it
        likes.push({ userId: userId, postId: postId }); // Add new like
        post.likes += 1; // Increment the likes count
    }
    console.log(likes);
    res.json({ success: true, likes: post.likes });
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
}

// Function to get the current user from session
function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    const {username, password} = req.body;
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    const newPost = {
        id: posts.length + 1,
        title,
        content,
        username: user.username,
        userId: user.id,
        timestamp: calculateDate(),
        likes: 0
    };
    posts.push(newPost);
    console.log(posts);
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
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