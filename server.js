const express = require("express");
const http = require("http");
const { ExpressPeerServer } = require("peer");
const lodash = require("lodash");
const path = require("path");
const { exit } = require("process");
const morgan = require("morgan");


const app = express();
const server = http.createServer(app);

app.enable("trust proxy");
app.use(morgan("short"));

const peerServer = ExpressPeerServer(server, {
    path: "/peerjs",
    proxied: true,
    debug: true,
    generateClientId: () => {
        return lodash.sample(prefix) + "-" + lodash.sample(names);
    },
});

app.use("/", peerServer);
app.use("/", express.static(path.join(__dirname, "build")));

const port = process.env.PORT || "3000";
server.listen({
    host: "localhost",
    port: port,
    exclusive: true,
}, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

server.on("error", (error) => {
    console.log("Error: ", error);
    exit(1);
})


const names = [
    'piglet',
    'cat',
    'fish',
    'fox',
    'chicken',
    'goat',
    'ram',
    'sheep',
    'bison',
    'dog',
    'walrus',
    'monkey',
    'bear',
    'lion',
    'zebra',
    'giraffe',
    'wolf',
    'rhino',
    'bat',
    'cat',
    'penguin',
    'rhino',
    'koala',
]

const prefix = [
    'adventurous',
    'affable',
    'ambitious',
    'amiable ',
    'amusing',
    'brave',
    'bright',
    'charming',
    'compassionate',
    'convivial',
    'courageous',
    'creative',
    'diligent',
    'easygoing',
    'emotional',
    'energetic',
    'enthusiastic',
    'exuberant',
    'fearless',
    'friendly',
    'funny',
    'generous',
    'gentle',
    'good',
    'helpful',
    'honest',
    'humorous',
    'imaginative',
    'independent',
    'intelligent',
    'intuitive',
    'inventive',
    'kind',
    'loving',
    'loyal',
    'modest',
    'neat',
    'nice',
    'optimistic',
    'passionate',
    'patient',
    'persistent',
    'polite',
    'practical',
    'rational',
    'reliable',
    'reserved',
    'resourceful',
    'romantic',
    'sensible',
    'sensitive',
    'sincere',
    'sympathetic',
    'thoughtful',
    'tough',
    'understanding',
    'versatile',
    'warmhearted',
];