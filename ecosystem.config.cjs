module.exports = {
  apps: [
    {
      name: "hesabat-api",
      script: "./artifacts/api-server/dist/index.mjs",
      interpreter: "none",
      node_args: "--enable-source-maps",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        PORT: "4000",
      },
    },
  ],
};
