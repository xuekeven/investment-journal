const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "investment-journal-api",
      cwd: path.join(root, "backend"),
      script: ".venv/bin/python",
      args: "-m uvicorn app.main:app --host 127.0.0.1 --port 6006",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: path.join(root, "logs", "investment-journal-api-out.log"),
      error_file: path.join(root, "logs", "investment-journal-api-error.log"),
      time: true,
    },
  ],
};
