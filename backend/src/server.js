import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Agritrace backend listening on http://localhost:${config.port}`);
  console.log(`Agritrace backend listening on http://0.0.0.0:${config.port}`);
});
