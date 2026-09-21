// Example text never accepts a credential. Real keys belong in server secrets.
export function apiExamples(endpoint: string) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
    || !['/daas/v1/catalog', '/daas/v1/health'].includes(url.pathname)
    || [...url.searchParams.keys()].some(key => !['q', 'search', 'page', 'perPage'].includes(key))) throw new Error('Invalid example endpoint');
  const safeUrl = url.toString().replace(/['"$`\\]/gu, char => '%' + char.charCodeAt(0).toString(16));
  return {
    curl: `curl --fail-with-body '${safeUrl}' \\\n  -H 'x-api-key: YOUR_API_KEY'`,
    javascript: `// Run on your server; read the real key from secret configuration.\nconst response = await fetch('${safeUrl}', {\n  headers: { 'x-api-key': 'YOUR_API_KEY' }\n});\nif (!response.ok) throw new Error('HTTP ' + response.status);\nconst data = await response.json();\nconsole.log(data); // Catalog: data.products, data.meta; health: status payload`,
    python: `import requests\n\nresponse = requests.get('${safeUrl}', headers={'x-api-key': 'YOUR_API_KEY'}, timeout=30)\nresponse.raise_for_status()\ndata = response.json()\nprint(data)`,
    php: `<?php\n$ch = curl_init('${safeUrl}');\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ['x-api-key: YOUR_API_KEY']);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\nif ($response === false || $status < 200 || $status >= 300) {\n    throw new RuntimeException('API request failed: HTTP ' . $status);\n}\n$data = json_decode($response, true);\ncurl_close($ch);\nprint_r($data);\n?>`,
  };
}
