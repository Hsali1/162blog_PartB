# Project Documentation

## Usage:
```console
> git clone https://github.com/jdkriner/162blog.git
> cd 162blog/scaffold
> npm install
> node server.js
```

## 1. User Registration

We are now able to register users:

- `POST /register`: This endpoint calls the `registerUser(req, res)` function.
- The `registerUser` function checks if a user exists; if not, it calls `addUser()`.
- The `addUser` function generates the current time and creates a new user object. It also returns the new object, but we are not doing anything with it currently.

## 2. User Lookup

- `findUserByUsername` and `findUserById` are used to find users in the users array.

## 3. Initial Users Array

The initial user array is defined as follows:

```javascript
let users = [
    { 
        id:             1,
        username:       'SampleUser',
        password:       'sss',
        avatar_url:     '/images/SampleUser.png',
        memberSince:    '2024-01-01 08:00' 
    },
    { 
        id:             2,
        username:       'AnotherUser',
        password:       'sss',
        avatar_url:     '/images/AnotherUser.png',
        memberSince:    '2024-01-02 09:00' 
    },
];
```
## 4. User Addition Example
When a user is added through registerUser, the array is updated as follows:

```javascript
[
    { 
        id:             1,
        username:       'SampleUser',
        password:       'sss',
        avatar_url:     '/images/SampleUser.png',
        memberSince:    '2024-01-01 08:00' 
    },
    { 
        id:             2,
        username:       'AnotherUser',
        password:       'sss',
        avatar_url:     '/images/AnotherUser.png',
        memberSince:    '2024-01-02 09:00' 
    },
    {
        id: 3,
        username: 'Hassan',
        password: 'Ali1',
        avatar_url: '/images/Hassan.png',
        memberSince: '2024-05-16 20:19'
    },
    {
        id: 4,
        username: 'Ali',
        password: 'Hassan',
        avatar_url: '/images/Ali.png',
        memberSince: '2024-05-16 20:19'
    }
]
```
## 5. Loggin in a user
following function will log the user in
```javascript
app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});

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
```
## 6. Log out a user
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
## 7. Rendering a profile
```javascript
app.get('/profile', isAuthenticated, (req, res) => {
    renderProfile(req, res);
});

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
```
## 8. Generate Avatar
```javascript
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

function generateAvatar(letter, width = 100, height = 100) {
    // TODO: Generate an avatar image with a letter
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
## 9. Create Posts
```javascript
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
```

## 10. Updating Likes
Users are not allowed to like their own posts and if they like a post they have already liked, their like will be removed.
```javascript
app.post('/like/:id', (req, res) => {
    updatePostLikes(req, res);
});

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
```

## 11. Resources
logo image: https://www.rawpixel.com/image/10164402/png-white-background-paper
Default image: license attached in image folder