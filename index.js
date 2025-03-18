import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/post", (req, res) => {
  res.render("post.ejs");
});

app.get("/modify", (req, res) => {
  res.render("modify.ejs");
});

app.post("/modify", upload.single("thumbnail"), async (req, res) => {
  try {
    if (req.file) {
      const filename = Date.now() + "-" + req.file.originalname;
      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(`thumbnail/${filename}`, req.file.buffer);
      if (error) throw error;
      const imageURL = `${process.env.SUPERBASE_URL}/storage/v1/object/public/uploads/${filename}`;
      console.log(imageURL);
    }
  } catch (err) {
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
