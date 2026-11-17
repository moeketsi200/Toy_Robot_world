/** Set this to the public HTTPS URL shown for the deployed Render web service. */
export const SERVER_HTTP_URL = 'https://toy-robot-worlds-server.onrender.com'
export const SERVER_WS_URL = SERVER_HTTP_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
