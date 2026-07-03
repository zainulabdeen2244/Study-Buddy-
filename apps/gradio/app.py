"""Optional Gradio workshop wrapper for Study-Buddy v4.
Run the Node API first: npm run dev
Then: pip install -r apps/gradio/requirements.txt && python apps/gradio/app.py
"""
import json
import os
import urllib.request
import urllib.error
import gradio as gr

API = os.environ.get("STUDY_BUDDY_API", "http://127.0.0.1:7860")

def post(path, payload=None):
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(f"{API}{path}", data=data, headers={"content-type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode("utf-8")}
    except Exception as e:
        return {"error": str(e)}

def load_demo():
    return json.dumps(post("/api/demo/load"), indent=2)

def ask(q):
    r = post("/api/ask", {"question": q})
    return r.get("answer", ""), json.dumps(r, indent=2)

def osce():
    r = post("/api/osce", {})
    return json.dumps(r.get("osce", r), indent=2)

with gr.Blocks(title="Study-Buddy v4") as demo:
    gr.Markdown("# Study-Buddy v4 - FORGE VideoRAG clinical learning OS")
    gr.Markdown("Education-only. Not diagnosis, prescription, or emergency care.")
    with gr.Tab("Demo"):
        btn = gr.Button("Load Golden Demo")
        out = gr.Textbox(lines=16)
        btn.click(load_demo, outputs=out)
    with gr.Tab("Ask"):
        q = gr.Textbox(value="Where does the instructor explain hand hygiene?", lines=3)
        answer = gr.Textbox(lines=12)
        raw = gr.Textbox(lines=18)
        gr.Button("Ask Study-Buddy").click(ask, inputs=q, outputs=[answer, raw])
    with gr.Tab("OSCE"):
        osce_out = gr.Textbox(lines=20)
        gr.Button("Generate OSCE").click(osce, outputs=osce_out)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("GRADIO_PORT", "7861")))
