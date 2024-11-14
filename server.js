import { createServer } from "node:http";
import { networkInterfaces } from 'os';
import { readFile } from "node:fs/promises";
const PORT = 8080;
// Define a map of files to serve
const files = {
    "/PatreonScript.js": {
        content: await readFile("PatreonScript.js"),
        type: "application/javascript",
    },
    "/PatreonConfig.json": {
        content: await readFile("PatreonConfig.json"),
        type: "application/json",
    },
    "/PatreonIcon.png": {
        content: await readFile("PatreonIcon.png"),
        type: "image/png",
    },
};
function getLocalIPAddress() {
    const br = networkInterfaces();
    const network_devices = Object.values(br);
    if (network_devices !== undefined) {
        for (const network_interface of network_devices) {
            if (network_interface === undefined) {
                continue;
            }
            for (const { address, family } of network_interface) {
                if (family === "IPv4" && address !== "127.0.0.1") {
                    return address;
                }
            }
        }
    }
    throw new Error("panic");
}
createServer((req, res) => {
    const file = (() => {
        switch (req.url) {
            case "/PatreonScript.js":
                return files[req.url];
            case "/PatreonConfig.json":
                return files[req.url];
            case "/PatreonIcon.png":
                return files[req.url];
            default:
                return undefined;
        }
    })();
    if (file !== undefined) {
        res.writeHead(200, { "Content-Type": file.type });
        res.end(file.content);
        return;
    }
    res.writeHead(404);
    res.end("File not found");
    return;
}).listen(PORT, () => {
    console.log(`Server running at http://${getLocalIPAddress()}:${PORT}/PatreonConfig.json`);
});
//# sourceMappingURL=server.js.map