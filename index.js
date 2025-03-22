import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const supabase = createClient(
  process.env.SUPERBASE_URL,
  process.env.SUPERBASE_KEY,
);
const supabaseWithAuth = (req) => {
  return createClient(
    process.env.SUPERBASE_URL,
    process.env.SUPERBASE_KEY,
    { global: { headers: { Authorization: `Bearer ${req.cookies.session_token}` } } }
  );
};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());

const storage = multer.memoryStorage();
const upload = multer({ storage });
const authenticate = async (req, res, next) => {
  const token = req.cookies.session_token;
  if (!token) {
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
  res.render("home.ejs", { user: req.user });
});

app.get("/post", (req, res) => {
  res.render("post.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post("/login", async (req, res) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json("Username or Password not specified");
  }
  const email = req.body.email;
  const password = req.body.password;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    res.cookie("session_token", data.session.access_token, {
      httpOnly: true, //prevents client-side js from accessing the cookie
      secure: true, //set true if using https
      maxAge: 7 * 86400000, // expiration time in ms (7days)
    });
    res.json({ redirect: "/" });
    // When you call res.json(), res.send(), or res.end(), the response is finalized, meaning no more headers (like cookies) can be added afterward.
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/cookies", authenticate, async (req, res) => {
  console.log(req.cookies.session_token);
  const supabaseAuth = supabaseWithAuth(req);
  const { data, error } = await supabaseAuth.rpc("get_current_role");
  console.log(data);
  // const { data, error } = await supabase.rpc("get_current_role");
  // console.log(data);
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
  res.render("profile.ejs");
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
