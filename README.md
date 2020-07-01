# Chat

An end-to-end encrypted chat client.

This demonstrates a Diffie-Hellman key exchange which is used to share a
common secret for the chat room. Authentication is done using a password
as part of a challenge + response protocol. The clients will automatically
check passwords for anybody joining with no rate-limit protection, so this
is not a fully secure client (no key rotation is performed either).

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
