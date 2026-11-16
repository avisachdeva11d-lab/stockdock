# StockDock — Stock dashboard + Docker learning lab

A small responsive stock-dashboard learning project. It includes a 200-row illustrative watchlist, market-index cards, charts, search/filter/pagination, and an optional server-side quote endpoint.

> **Data honesty:** the built-in watchlist, index values, movers and chart history are sample data for UI and Docker practice. They are not current market prices and must not be used for investment decisions. The optional Alpha Vantage endpoint can fetch a quote for a selected symbol if you supply your own API key; quote freshness and market coverage depend on the provider plan and exchange entitlements. It does not turn all 200 rows or every index into live data.

## Run without Docker
Requires Node.js 20+.

```bash
npm start
```

Open http://localhost:3000

## Run in Docker (demo mode)
Run these commands from the folder containing `Dockerfile`:

```bash
docker build -t stockdock:1.0 .
docker image ls
docker run -d --name stockdock -p 3000:3000 stockdock:1.0
docker ps
```

Open http://localhost:3000

### What the commands mean
- `docker build -t stockdock:1.0 .`: build an image from the Dockerfile in the current directory and tag it `stockdock:1.0`.
- `docker run`: create a container from that image and start it.
- `-d`: run in the background.
- `--name stockdock`: give the container a memorable name.
- `-p 3000:3000`: forward host port 3000 to container port 3000 (host:container).
- `docker ps`: list running containers.

## Useful practice commands

```bash
docker logs -f stockdock
docker inspect stockdock
docker exec -it stockdock sh
docker stats stockdock
docker stop stockdock
docker start stockdock
docker restart stockdock
docker rm -f stockdock
docker image ls
docker image rm stockdock:1.0
```

The `node:22-alpine` base image is a small Alpine Linux image with Node.js 22 installed. Alpine is a Linux distribution, not a container by itself. The Docker image is a read-only template; a container is a running instance created from that template. Inside the container, try `cat /etc/os-release`, `node --version`, and `pwd` after `docker exec -it stockdock sh`.

## Enable an optional provider-backed quote

1. Get an API key from the official Alpha Vantage site: https://www.alphavantage.co/support/#api-key
2. Stop and remove the existing container:
   ```bash
   docker rm -f stockdock
   ```
3. Start it again, passing the key as an environment variable (replace the placeholder):
   ```bash
   docker run -d --name stockdock -p 3000:3000 -e ALPHA_VANTAGE_API_KEY='YOUR_KEY_HERE' stockdock:1.0
   ```
4. Click the small arrow at the end of a row to request a quote for that ticker.

The API key is read by the server and is not embedded in the browser JavaScript. Avoid committing API keys to Git. Free-tier rate limits can make repeated requests fail. Provider symbols and coverage vary; US symbols and Indian symbols may not all be supported at the same freshness level. This project does not poll 200 symbols automatically because that can exceed free API limits.

## Troubleshooting
- **`Dockerfile` not found:** make sure your terminal is in the `stockdock` project folder and the file is named exactly `Dockerfile` (no `.txt` suffix). Run `dir` in Windows CMD or `ls -la` on Linux.
- **Port 3000 is busy:** use `-p 8080:3000` and visit http://localhost:8080.
- **Name already in use:** `docker rm -f stockdock` before running it again.
- **Docker daemon unavailable:** start Docker Desktop or the Docker service before building/running.
- **Chart blank:** confirm internet access; Chart.js is loaded from a CDN. The rest of the app can still load.

## Disclaimer
Educational software only. Sample data is fictional/illustrative; external quotes may be delayed, incomplete, or subject to provider terms. Not investment advice.
