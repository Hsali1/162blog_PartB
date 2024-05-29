# Project Documentation

## Usage:
```console
> git clone https://github.com/Hsali1/162blog_PartB.git
> cd 162blog/scaffold
> npm install
> node server.js
```
Would require a .env file with .db file, session secret and api key for emojis established

## 1. User Registration

We are now able to register users:

```javascript
app.post('/register', (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);
    console.log('Registeration complete');
});

async function registerUser(req, res) {
    const { username, password } = req.body;
    try {
        const db = app.locals.db;
        const userExists = await db.get("SELECT * FROM users WHERE username = ?", [username]);
        if (userExists) {
            res.redirect('/register?error=Username+already+exists');
        } else {
            await db.run("INSERT INTO users (username, password, memberSince) VALUES (?, ?, ?)", [username, password, new Date().toISOString()]);
            res.redirect('/login');
        }
    } catch (error) {
        console.error("Database error:", error);
        res.redirect('/register?error=Unexpected+Error');
    }
}
```

## 2. Loggin in a user
following function will log the user in
```javascript
app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});

async function loginUser(req, res) {
    const { username, password } = req.body;
    try {
        const db = app.locals.db;
        const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
        if (user && user.password === password) { 
            req.session.userId = user.id;
            req.session.loggedIn = true;
            console.log(`${username} logged in at ${calculateDate()}`);
            res.redirect('/');
        } else {
            res.redirect('/login?error=Invalid+credentials');
        }
    } catch (error) {
        console.error("Database error:", error);
        res.redirect('/login?error=Unexpected+Error');
    }
}
```
## 3. Log out a user
```javascript
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});

function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy(() => {
        res.redirect('/');
    })
}
```
## 4. Rendering a profile
```javascript
app.get('/profile', isAuthenticated, (req, res) => {
    // TODO: Render profile page
    renderProfile(req, res);
});

async function renderProfile(req, res) {
    try {
        const db = app.locals.db;
        const user = await findUserById(req.session.userId);
        if (user) {
            // Fetch posts from the database where the username matches the logged-in user's username
            const userPosts = await db.all("SELECT * FROM posts WHERE username = ?", user.username);

            // Add a property to each post to indicate that the user can edit their own posts
            userPosts.forEach(post => post.userCanEdit = true);

            console.log(userPosts);
            res.render('profile', { user, posts: userPosts, postNeoType: 'Post'});
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.render('error', { message: 'Error loading profile page.' });
    }
}
```
## 5. Generate Avatar
```javascript
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
```
## 6. Create Posts
```javascript
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

async function addPost(title, content, username) {
    const db = app.locals.db;
    const date = calculateDate();
    console.log('Adding post to database with username:', username); // Log the username
    await db.run(
        "INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, 0)",
        [title, content, username, date]
    );
}
```

## 7. Updating Likes
Users are not allowed to like their own posts and if they like a post they have already liked, their like will be removed.
```javascript
app.post('/like/:id', async (req, res) => {
    await updatePostLikes(req, res);
});

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
```

## 8. Comments
```javascript
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
```

## 9. Resources
logo image: https://www.rawpixel.com/image/10164402/png-white-background-paper
Default image: license attached in image folder