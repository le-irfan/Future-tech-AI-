# FutureTechX Web Database

The repository now includes a lightweight server-side comments database for the blog.

## What it stores

Each comment contains:

- `id` - unique comment ID
- `post` - blog article ID (`ai`, `design`, or `development`)
- `name` - visitor name
- `comment` - visitor comment
- `createdAt` - timestamp

The data is stored in `data/comments.json`.

## Run it locally

You need Node.js 18 or newer.

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

The API endpoints are:

```text
GET  /api/comments?post=ai
POST /api/comments
GET  /api/health
```

A POST request should send JSON like:

```json
{
  "name": "Irfan",
  "comment": "This website is getting crazy.",
  "post": "ai"
}
```

## Important: GitHub Pages

GitHub Pages can host the HTML/CSS/JS files, but it cannot run `server.js`. Therefore the comments database will **not** work on a normal GitHub Pages-only deployment.

For real multi-user comments, deploy this Node server on a host that runs Node.js and has persistent storage. Then change `API_URL` in `b.html` from `/api/comments` to your deployed API URL.

Do not put database passwords, API keys, or private tokens in the frontend files.
