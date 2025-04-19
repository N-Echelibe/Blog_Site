import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";
import { marked, Marked } from "marked";
import { relative } from "path";
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
async function getUserInfo(req, supabase) {
  try {
    const { data: userinfo, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", req.user.id)
      .single();
    if (error) throw error;
    return userinfo;
  } catch (error) {
    console.error(error);
    return null;
  }
}

app.get("/", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: posts, error } = await supabaseAuth
      .from("userPosts")
      .select("*");
    if (error) throw error;
    if (req.user) {
      const userinfo = await getUserInfo(req, supabaseAuth);
      res.render("home.ejs", { user: userinfo, posts: posts });
    } else {
      res.render("home.ejs", { posts: posts });
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/post/:id", async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  const id = req.params.id;
  try {
    const { data, error } = await supabaseAuth
      .from("userPosts")
      .select("*")
      .eq("post_id", id)
      .single();
    if (error) throw error;
    const content = marked(data.content);
    res.render("post.ejs", { post: data, content: content });
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
      const filename = Date.now() + "-" + req.file.originalname;
      const { data, error } = await supabaseAuth.storage
        .from("uploads")
        .upload(`thumbnail/${filename}`, req.file.buffer);
      if (error) {
        console.log(error);
      } else {
        const imageURL = `${process.env.SUPERBASE_URL}/storage/v1/object/public/uploads/thumbnail/${filename}`;
        console.log(imageURL);
        const { data, error } = await supabaseAuth.from("userPosts").insert([
          {
            user_id: req.user.id,
            title: req.body.title,
            content: req.body.content,
            thumbnail: imageURL,
            category: req.body.category,
          },
        ]);
        if (error) throw error;
        res.json({ redirect: "/" });
      }
    } catch (err) {
      console.log(err);
    }
  }
);

app.get("/profile", authenticate, async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data: userinfo, error } = await supabaseAuth
      .from("users")
      .select("*")
      .eq("user_id", req.user.id)
      .single();
    if (error) throw error;
    res.render("profile.ejs", { user: userinfo });
  } catch (error) {
    console.error(error);
  }
});

app.post("/profile", authenticate, upload.single("pfp"), async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const supabaseAuth = supabaseWithAuth(req);
  const userinfo = await getUserInfo(req, supabaseAuth);
  try {
    let filename;
    let filepath;
    let imageURL;
    if (req.file) {
      filename = Date.now() + "_" + req.file.originalname;
      filepath = "pfp/" + filename;
      imageURL = `${process.env.SUPERBASE_URL}/storage/v1/object/public/uploads/${filepath}`;
      const { data, error } = await supabaseAuth.storage
        .from("uploads")
        .upload(`${filepath}`, req.file.buffer);
      if (error) throw error;
      if (userinfo.filepath) {
        console.log("condition is true")
        const { data, error } = await supabaseAuth.storage
          .from("uploads")
          .remove([userinfo.filepath]);
        if (error) throw error;
      }
    }
    const { data, error } = await supabaseAuth.from("users").update({
      username: req.body.username,
      pfp: imageURL || userinfo.pfp,
      about: req.body.about,
      filepath: filepath || userinfo.filepath,
    }).eq("user_id", req.user.id);
    if (error) throw error;
    res.status(200).json("updated successfully");
  } catch (error) {
    console.error(error);
  }
});

app.get("/logout", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  const { error } = await supabaseAuth.auth.signOut();
  if (error) throw error;
  res.clearCookie("session_token");
  res.clearCookie("refresh_token");
  res.redirect("/");
});

app.get("/test", async (req, res) => {
  const gg = "hello" + " kitty";
  console.log(gg);
  const supabaseAuth = supabaseWithAuth(req);
  const { data, error } = await supabaseAuth.rpc("get_current_role");
  console.log(data);
  console.log(req.cookies.session_token);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
