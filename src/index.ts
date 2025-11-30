import Fastify from "fastify";

const app = Fastify();

const port = Number(process.env.PORT) || 3000;

app.get("/", async () => {
  return { ok: true, message: "TS rodando no Node 22 🎉" };
});

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    console.log("Server listening at", address);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
