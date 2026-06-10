module.exports = { apps: [{
  "name": "ourclass",
  "script": "node_modules/.bin/tsx",
  "args": "src/index.ts",
  "cwd": "/Users/worable/Documents/大作业/our-class/server",
  "env": {
    "NODE_ENV": "production"
  },
  "instances": 1,
  "exec_mode": "fork"
}] }