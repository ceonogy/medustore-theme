module.exports = {
  apps: [
    {
      name: "storefront",
      script: "node",
      args: "./dist/server/entry.mjs",
      cwd: __dirname, // wherever the repo is checked out
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOST: "127.0.0.1",
      },
      max_memory_restart: "512M",
      restart_delay: 5000,
    },
  ],
};
