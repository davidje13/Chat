# Chat

A very insecure chat client.

Uses [EchoChamber](https://github.com/davidje13/EchoChamber) for server-side
relaying.

## Deploying

This project compiles to static files which can be served by any server.
It expects to be connected to an existing deployment of
[EchoChamber](https://github.com/davidje13/EchoChamber).

1. Configure the EchoChamber URL and build:

   ```sh
   ECHO_HOST=wss://example.com:1234 npm run build
   ```

2. Deploy all static files in `/build`

## Local Development

To run locally:

```sh
npm start
```

This will compile the source and run a local static server on port 8080, as
well as a test EchoChamber server on port 8081. Changing source files will
trigger an automatic recompilation.
