# Firewall Log Analyzer Backend

Node.js + TypeScript backend foundation for firewall log uploads and future analysis jobs.

## Install

```bash
cd backend
pnpm install
```

Copy the example environment file if you want local overrides:

```bash
cp .env.example .env
```

## Run

```bash
pnpm dev
```

The server defaults to `http://localhost:4000`.

Build and run compiled output:

```bash
pnpm build
pnpm start
```

## Endpoints

### `GET /api/health`

Returns service health.

### `POST /api/uploads`

Accepts one firewall log file using `multipart/form-data`.

Allowed extensions:

- `csv`
- `tsv`
- `txt`
- `log`
- `json`
- `ndjson`

Example:

```bash
curl -F "file=@sample.csv" http://localhost:4000/api/uploads
```

Response:

```json
{
  "uploadId": "uuid",
  "jobId": "uuid",
  "fileName": "sample.csv",
  "status": "queued"
}
```

### `GET /api/uploads/:id`

Returns stored upload metadata.

### `GET /api/jobs/:jobId`

Returns in-memory job status. Supported statuses are `queued`, `processing`, `completed`, and `failed`.

## Configuration

Environment variables:

- `PORT`: server port, default `4000`
- `CORS_ORIGIN`: allowed frontend origin, default `http://localhost:5173`
- `MAX_UPLOAD_MB`: upload size limit, default `25`

## Security Notes

- File contents are not stored or logged.
- Uploads are limited by extension and size.
- CORS is restricted to `CORS_ORIGIN`.
- Helmet security headers are enabled.
- Request body size is limited.
- Production error responses do not include stack traces.
- Upload and job data are stored in memory only and are lost when the process restarts.
