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
  process.env.SUPERBASE_KEY
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());

const storage = multer.memoryStorage();
const upload = multer({ storage });
const authenticate = async (req, res, next) => {
  const token = req.cookies.session_token;
  if (!token) return res.redirect("/login");

  const {data: {user}, error} = await supabase.auth.getUser(token);

  if (!user || error) return res.redirect("/login");

  req.user = user;
}

app.get("/", (req, res) => {
  res.render("home.ejs");
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
    res.cookie('session_token', data.session.access_token, {
      httpOnly: true, //prevents client-side js from accessing the cookie
      secure: true, //set true if using https
      maxAge: 7 * 86400000, // expiration time in ms (7days)
    });
    console.log(data.session.access_token);
    res.json({message: 'Login Successful', data});
    // When you call res.json(), res.send(), or res.end(), the response is finalized, meaning no more headers (like cookies) can be added afterward.
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/modify", (req, res) => {
  res.render("modify.ejs");
});

app.post("/modify", upload.single("thumbnail"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file found" });
  }
  try {
    const filename = Date.now() + "-" + req.file.originalname;
    const { data, error } = await supabase.storage
      .from("uploads")
      .upload(`thumbnail/${filename}`, req.file.buffer);
    if (error) {
      console.log(error);
    } else {
      const imageURL = `${process.env.SUPERBASE_URL}/storage/v1/object/public/uploads/thumbnail/${filename}`;
      console.log(imageURL);
      // const { data, error } = await supabase
      //   .from("userPosts")
      //   .insert([
      //     {
      //       user_id: 1,
      //       title: req.body.title,
      //       content: req.body.content,
      //       thumbnail: imageURL,
      //       category: req.body.category,
      //     },
      //   ]);
    }
  } catch (err) {
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
