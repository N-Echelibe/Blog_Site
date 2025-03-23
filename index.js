import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";
import { marked, Marked } from "marked";
// ☝️ is used to convert markdown content to HTML

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const supabase = createClient(
  process.env.SUPERBASE_URL,
  process.env.SUPERBASE_KEY
);
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
  const refresh_token = req.cookies.refresh_token;

  if (!token && refresh_token) {
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: refresh_token,
    });
    if (data?.session) {
      token = data.session.access_token;
      res.cookie("session_token", token, {
        httpOnly: true,
        secure: true,
        maxAge: 7 * 86400000,
      });
    }
  } else if (!token) {
    req.user = null;
    return next();
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (!user || error) {
    req.user = null;
    return next();
  }

  req.user = user;
  next();
};

app.get("/", authenticate, async (req, res) => {
  const supabaseAuth = supabaseWithAuth(req);
  try {
    const { data, error } = await supabaseAuth.from("userPosts").select("*");
    if (error) throw error;
    res.render("home.ejs", { user: req.user, posts: data });
  } catch (err) {
    console.log(err);
  }
  // res.render("home.ejs", { user: req.user });
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
  const email = req.body.email;
  const password = req.body.password;
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    } else {
      res.cookie("session_token", data.session.access_token, {
        httpOnly: true, //prevents client-side js from accessing the cookie
        secure: true, //set true if using https
        maxAge: 7 * 86400000, // expiration time in ms (7days)
      });
      res.cookie("refresh_token", data.session.refresh_token, {
        httpOnly: true, //prevents client-side js from accessing the cookie
        secure: true, //set true if using https
        maxAge: 30 * 86400000, // expiration time in ms (7days)
      });
      res.json({ redirect: "/" });
    }

    // When you call res.json(), res.send(), or res.end(), the response is finalized, meaning no more headers (like cookies) can be added afterward.
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/signup", async (req, res) => {
  res.render("signup.ejs");
})

app.get("/cookies", authenticate, async (req, res) => {
  console.log(req.cookies.session_token);
  const supabaseAuth = supabaseWithAuth(req);
  const { data, error } = await supabaseAuth.rpc("get_current_role");
  console.log(data);
  console.log(req.cookies.refresh_token);
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
      }
    } catch (err) {
      console.log(err);
    }
  }
);

app.get("/profile", authenticate, async (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("profile.ejs");
});

app.get("/logout", authenticate, async (req, res) => {
  // res.clearCookie("session_token");
  const supabaseAuth = supabaseWithAuth(req);
  const { error } = await supabaseAuth.auth.signOut();
  if (error) throw error;
  res.clearCookie("session_token");
  res.clearCookie("refresh_token");
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
