/* 
===========================================================================================================
Server Setup
Block Contains:
 - Required dependencies
 - dotenv config loading
 - Express setup with CORS and JSON support
===========================================================================================================
*/

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

/* 
===========================================================================================================
Root Endpoint
Block Contains:
 - Simple GET route to confirm backend is running
 - Useful for debugging or health checks
===========================================================================================================
*/

app.get("/", (req, res) => 
{
    res.json({ message: "TrustCheck.AI backend is running successfully." });
});

/* 
===========================================================================================================
Server Listener
Block Contains:
 - Starts Express server on port 3000
 - Logs server running confirmation
===========================================================================================================
*/

app.listen(3000, () => 
{
    console.log("=) Server running on port 3000");
});
