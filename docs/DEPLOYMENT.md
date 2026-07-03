# Deployment

## Local

```bash
npm install
npm run build
npm start
```

## Docker

```bash
docker compose up --build
```

## Render

Use `render.yaml`.

## Hugging Face Spaces

Use the Gradio wrapper only when you also run the Node API, or deploy the Node API elsewhere and set `STUDY_BUDDY_API` for the Gradio app.
