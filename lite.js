const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use("/workspace", express.static(path.join(__dirname, "workspace")));

app.get("/", (req,res)=>res.send("AI SaaS Factory 🚀"));

app.get("/dashboard",(req,res)=>{
  res.send("Dashboard Ready");
});

app.listen(PORT, "0.0.0.0", ()=>{
  console.log("Running on " + PORT);
});
