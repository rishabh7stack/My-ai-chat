import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.GEMINI_API_KEY;
// Gemini's current Search-grounding guide uses this model for new projects.
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const page = join(here, 'my-ai-chat.html');

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function citationsFrom(data) {
  const citations = [];
  for (const step of data.steps || []) {
    for (const block of step.content || []) {
      for (const annotation of block.annotations || []) {
        if (annotation.type === 'url_citation' && annotation.url) {
          citations.push({ url: annotation.url, title: annotation.title || new URL(annotation.url).hostname });
        }
      }
    }
  }
  return Array.from(new Map(citations.map((item) => [item.url, item])).values());
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 24_000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function research(question) {
  const prompt = [
    'You are my-ai-chat Research, a careful and concise web-research assistant.',
    'Answer the user directly. Use Google Search grounding when current or factual web evidence would improve the answer.',
    'Synthesize sources instead of copying them. State uncertainty when sources conflict. Use short paragraphs and helpful bullets only when they improve clarity.',
    `User question: ${question}`
  ].join('\n\n');
  const result = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ model, input: prompt, tools: [{ type: 'google_search' }] })
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data?.error?.message || `Gemini returned ${result.status}.`);
  return { answer: data.output_text || 'I could not generate an answer from that research request.', citations: citationsFrom(data) };
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(page);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(html);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { ready: Boolean(apiKey), model: apiKey ? model : null });
    }
    if (request.method === 'POST' && url.pathname === '/api/research') {
      if (!apiKey) return sendJson(response, 503, { error: 'Add a Gemini API key, then restart My AI Chat Research.' });
      const { question } = await readBody(request);
      if (typeof question !== 'string' || !question.trim()) return sendJson(response, 400, { error: 'Please enter a question.' });
      if (question.length > 6000) return sendJson(response, 400, { error: 'Please keep the question under 6,000 characters.' });
      return sendJson(response, 200, await research(question.trim()));
    }
    return sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`My AI Chat Research is running at http://127.0.0.1:${port}`);
  if (!apiKey) console.log('Waiting for GEMINI_API_KEY. Stop the server and start it again after entering a key.');
  if (process.env.OPEN_BROWSER === '1') {
    const browser = spawn('open', [`http://127.0.0.1:${port}`], { detached: true, stdio: 'ignore' });
    browser.unref();
  }
});
