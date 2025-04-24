import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";
import { marked } from "marked";
import { relative } from "path";
import { ifError } from "assert";
import { log } from "console";
// ☝️ is used to convert markdown content to HTML

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const supabaseWithAuth = (req) => {
  if (req.cookies.session_token) {
    return createClient(process.env.SUPERBASE_URL, process.env.SUPERBASE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${req.cookies.session_token}` },
      },
    });
  }
  return createClient(process.env.SUPERBASE_URL, process.env.SUPERBASE_KEY);
};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());

const storage = multer.memoryStorage();
const upload = multer({ storage });
const authenticate = async (req, res, next) => {
  const supabaseAuth = supabaseWithAuth(req);
  let token = req.cookies.session_token;
  let refresh_token = req.cookies.refresh_token;

  if (!token && refresh_token) {
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: refresh_token,
    });
    if (error) throw error;
    if (data?.session) {
      token = data.session.access_token;
      refresh_token = data.session.refresh_token;
      cookie(res, token, refresh_token);
    }
  } else if (!token) {
    req.user = null;
    return next();
  }
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (!user || error) {
    req.user = null;
    return next();
  }

  req.user = user;
  next();
};
function cookie(res, access_token, refresh_token) {
  res.cookie("session_token", access_token, {
    httpOnly: true,
    secure: true,
    maxAge: 3600000, // 1hr
  });

  if (refresh_token) {
    res.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 86400000, // 30days
    });
  }
}
async function generateUsername(supabase) {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let username = "user_";
  for (let i = 0; i < 8; i++) {
    username += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  try {
    const { data, error } = await supabase
      .from("users")
      .select("username")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    if (data) return await generateUsername(supabase);
    return username;
  } catch (error) {
    console.error(error);
  }
}
async function getUserInfo(id, supabase) {
  try {
    const { data: userinfo, error: usererror } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", id)
      .single();
    if (usererror) throw usererror;
    return userinfo;
  } catch (error) {
    console.error(error);
    return null;
  }
}
async function uploadImage(req, folder, supabase) {
  const filename = Date.now() + "_" + req.file.originalname;
  const filepath = folder + filename;
  const imageURL = `${process.env.SUPERBASE_URL}/storage/v1/object/public/uploads/${filepath}`;
  try {
    const { data, error } = await supabase.storage
      .from("uploads")
      .upload(`${filepath}`, req.file.buffer);
    if (error) throw error;
    console.log("Image uploaded successfully");
    return { filepath, imageURL };
  } catch (error) {
    console.error("Error uploading image:", error);
    console.log("uploadImage function");
  }
}

app.get("/", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: posts, error } = await supabaseAuth
      .from("userPosts")
      .select("*");
    if (error) throw error;
    const userinfo = await getUserInfo(req.user.id, supabaseAuth);
    res.render("home.ejs", { user: userinfo, posts: posts });
  } catch (err) {
    console.log(err);
  }
});

app.get("/post/:id", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  const id = req.params.id;
  try {
    const { data, error } = await supabaseAuth
      .from("userPosts")
      .select("*")
      .eq("post_id", id)
      .single();
    if (error) throw error;
    const userinfo = await getUserInfo(req.user.id, supabaseAuth);
    const content = await marked(data.content);
    res.render("post.ejs", { user: userinfo, post: data, content: content });
  } catch (err) {
    console.log(err);
  }
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post("/login", async (req, res) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json("Username or Password not specified");
  }
  const supabaseAuth = supabaseWithAuth(req);
  const { email, password } = req.body;
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    } else {
      cookie(res, data.session.access_token, data.session.refresh_token);
      res.json({ redirect: "/" });
    }
    // When you call res.json(), res.send(), or res.end(), the response is finalized, meaning no more headers (like cookies) can be added afterward.
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/signup", async (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json("Username or Password not specified");
  }
  let supabaseAuth = supabaseWithAuth(req);
  const { password, email, username } = req.body;
  console.log(email);
  try {
    const { data, error } = await supabaseAuth.auth.signUp({
      email: email,
      password: password,
    });
    if (error) throw error;
    res.json({ class: "hidden" });
  } catch (error) {
    console.error(error);
  }
});

app.get("/confirmaccount", (req, res) => {
  res.render("confirm.ejs");
});

app.post("/confirm-account", async (req, res) => {
  const { access_token, refresh_token } = req.body;
  cookie(res, access_token, refresh_token);
  const supabaseAuth = createClient(
    process.env.SUPERBASE_URL,
    process.env.SUPERBASE_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    }
  );
  try {
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(access_token);
    if (error) {
      throw error;
    } else {
      const username = await generateUsername(supabaseAuth);
      console.log(username);
      const { data, error } = await supabaseAuth.from("users").insert([
        {
          user_id: user.id,
          username: username,
        },
      ]);
      if (error) throw error;
      res.status(200).json({ success: true, data });
    }
  } catch (error) {
    console.error(error);
  }
});

app.get("/modify", authenticate, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("modify.ejs");
});

app.post(
  "/modify",
  authenticate,
  upload.single("thumbnail"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file found" });
    }
    const supabaseAuth = supabaseWithAuth(req);
    try {
      const { filepath, imageURL } = await uploadImage(
        req,
        "thumbnail/",
        supabaseAuth
      );
      const { data, error } = await supabaseAuth.from("userPosts").insert([
        {
          user_id: req.user.id,
          title: req.body.title,
          content: req.body.content,
          thumbnail: imageURL,
          category: req.body.category,
          lede: req.body.lede,
          filepath: filepath,
        },
      ]);
      if (error) throw error;
      res.json({ redirect: "/profile" });
    } catch (err) {
      console.log(err);
    }
  }
);

app.get("/profile/@:username", authenticate, async (req, res) => {
  const username = req.params.username;
  const supabaseAuth = supabaseWithAuth(req);
  let myProfile = false;
  try {
    const userinfo = await getUserInfo(
      req.user.id,
      supabaseAuth
    );
    const { data: profile, error: profileerror } = await supabaseAuth
      .from("users")
      .select("*")
      .eq("username", username)
      .single();
    if (profileerror) throw profileerror;
    if (req.user && req.user.id == profile.user_id) {
      myProfile = true;
    }
    const { data: posts, error: postsError } = await supabaseAuth
      .from("userPosts")
      .select("*")
      .eq("user_id", profile.user_id)
      .order("post_id", { ascending: false });
    if (postsError) throw postsError;
    const { count: followers, error: followerError } = await supabaseAuth
      .from("followers")
      .select("follower", { count: "exact", head: true })
      .eq("following", profile.user_id);
    if (followerError) throw followerError;
    const { count: following, error: followingError } = await supabaseAuth
      .from("followers")
      .select("following", { count: "exact", head: true })
      .eq("follower", profile.user_id);
    if (followingError) throw followingError;
    const { data: myfollowersraw, error: myfollowerError } = await supabaseAuth
      .from("followers")
      .select("follower")
      .eq("following", userinfo.user_id);
    if (myfollowerError) throw myfollowerError;
    const { data: myfollowingraw, error: myfollowingError } = await supabaseAuth
      .from("followers")
      .select("following")
      .eq("follower", userinfo.user_id);
    if (myfollowingError) throw myfollowingError;
    const myfollowers = myfollowersraw.map((obj) => Object.values(obj)[0]);
    const myfollowing = myfollowingraw.map((obj) => Object.values(obj)[0]);
    res.render("profile.ejs", {
      profile: profile,
      user: userinfo,
      posts: posts,
      followers: followers,
      following: following,
      myProfile: myProfile,
      myfollowers: myfollowers,
      myfollowing: myfollowing,
    });
  } catch (error) {
    console.error(error);
  }
});

app.post("/profile", authenticate, upload.single("pfp"), async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const supabaseAuth = supabaseWithAuth(req);
  const userinfo = await getUserInfo(req.user.id, supabaseAuth);
  try {
    let filename;
    let filepath;
    let imageURL;
    if (req.file) {
      ({ filepath, imageURL } = await uploadImage(req, "pfp/", supabaseAuth));
      if (userinfo.filepath) {
        console.log("condition is true");
        const { data, error } = await supabaseAuth.storage
          .from("uploads")
          .remove([userinfo.filepath]);
        if (error) throw error;
      }
    }
    const { data, error } = await supabaseAuth
      .from("users")
      .update({
        username: req.body.username,
        pfp: imageURL || userinfo.pfp,
        about: req.body.about,
        filepath: filepath || userinfo.filepath,
      })
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.status(200).json("updated successfully");
  } catch (error) {
    console.error(error);
  }
});

app.post("/follow", authenticate, async (req, res) => {
  const id = req.body.id;
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: check, error: checkerror } = await supabaseAuth
      .from("followers")
      .select("*")
      .eq("follower", req.user.id)
      .eq("following", id)
      .single();
    if (checkerror) console.log(checkerror);
    if (check) {
      const { data: unfollow, error: unfollowerror } = await supabaseAuth
        .from("followers")
        .delete()
        .eq("follower", req.user.id)
        .eq("following", id);
      if (unfollowerror) throw unfollowerror;
      console.log("unfollow");
      res.status(200).json("Successful");
    } else {
      const { data: follow, error: followerror } = await supabase
        .from("followers")
        .insert([
          {
            follower: req.user.id,
            following: id,
          },
        ]);
      if (followerror) throw followerror;
      console.log("follow");
      res.status(200).json("Successful");
    }
  } catch (error) {
    console.error(error);
  }
});

app.get("/query", authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: posts, error: posterror } = await supabaseAuth
      .from("userPosts")
      .select("title")
      .ilike("title", `%${q}%`);
    if (posterror) throw posterror;
    const { data: author, error: authorerror } = await supabaseAuth
      .from("users")
      .select("username")
      .ilike("username", `%${q}%`);
    if (authorerror) throw authorerror;
    const data = [...posts, ...author]; // combines arrays together
    const results = data.map((obj) => Object.values(obj)[0]); // selects the values in each object in the array. adding [0] at the end selects the first property in each object. By default, each object will return an array unless [] is used
    results.sort();
    console.log(results);
    res.json(results);
  } catch (error) {
    console.error(error);
  }
});

app.post("/search", authenticate, async (req, res) => {
  const { search } = req.body;
  // console.log(search);
  res.json({redirect: `/search?q=${search}`});
});

app.get("/search", authenticate, async (req, res) => {
  const {q} = req.query;
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: posts, error: posterror } = await supabaseAuth
      .from("userPosts")
      .select("*")
      .ilike("title", `%${q}%`);
    if (posterror) throw posterror;

    const { data: authors, error: authorerror } = await supabaseAuth
      .from("users")
      .select("*")
      .ilike("username", `%${q}%`);
    if (authorerror) throw authorerror;

    const userinfo = await getUserInfo(req.user.id, supabaseAuth);
    res.render("search.ejs", {
      user: userinfo,
      posts: posts,
      authors: authors,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while processing your request.");
  }
})

app.get("/logout", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  const { error } = await supabaseAuth.auth.signOut();
  if (error) throw error;
  res.clearCookie("session_token");
  res.clearCookie("refresh_token");
  res.redirect("/");
});

app.get("/test", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  // const { data, error } = await supabaseAuth.rpc("get_current_role");
  // console.log(data);
  // const fullPath = "alkd";
  // const { data: userProfile, error: userProfileError } = await supabase
  //   .from("users")
  //   .select("user_id")
  //   .eq("filepath", fullPath)
  //   .single();
  // console.log(userProfile);
  const id = "093d565f-7910-4434-abda-818948d41297";
  const { data: check, error: checkerror } = await supabaseAuth
    .from("followers")
    .select("*")
    .eq("follower", req.user_id)
    .eq("following", id)
    .single();
  console.log(check);
  console.log(checkerror);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
// Service
const supabase = createClient(
  process.env.SUPERBASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const folders = ["pfp", "thumbnail"];
async function cleanupOrphanedFiles() {
  try {
    for (const folder of folders) {
      console.log(`Checking folder: ${folder}`);

      const { data: files, error: listError } = await supabase.storage
        .from("uploads") // your bucket name
        .list(folder, { limit: 1000 });

      if (listError) throw listError;
      for (const file of files) {
        const fullPath = `${folder}/${file.name}`;

        // Check if this file exists in users table
        const { data: userProfile, error: userProfileError } = await supabase
          .from("users")
          .select("user_id")
          .eq("filepath", fullPath)
          .single();

        // Check if this file exists in userPosts table
        const { data: userPost, error: userPostError } = await supabase
          .from("userPosts")
          .select("user_id")
          .eq("filepath", fullPath)
          .single();

        // If file doesn't exist in either place, it's safe to delete
        if (!userProfile && !userPost) {
          await supabase.storage.from("uploads").remove([fullPath]);
          console.log(`Deleted: ${fullPath}`);
        }
      }
    }
    console.log("Cleanup complete ✅");
  } catch (err) {
    console.error("Cleanup failed ❌", err);
  }
}
// cleanupOrphanedFiles();
