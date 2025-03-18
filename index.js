import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
// ☝️ is used to handle files cuz express can't

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    const uniquePrefix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniquePrefix + "-" +  file.originalname);
  },
});
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/post", (req, res) => {
  res.render("post.ejs");
});

app.get("/modify", (req, res) => {
  res.render("modify.ejs");
});

app.post("/modify", upload.single("thumbnail"), (req, res) => {
  const title = req.body.title;
  const imagePath = req.file;
  console.log(title);
  console.log(imagePath);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
