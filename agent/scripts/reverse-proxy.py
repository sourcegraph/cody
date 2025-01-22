#!/usr/bin/env python3

import random
from aiohttp import web, ClientSession
from urllib.parse import urlparse
import argparse
import re

async def proxy_handler(request):
    async with ClientSession(auto_decompress=False) as session:
        print(f'Request to: {request.url}')

        # Modify headers here
        headers = dict(request.headers)

        # Reset the Host header to use target server host instead of the proxy host
        if 'Host' in headers:
            headers['Host'] = urlparse(target_url).netloc.split(':')[0]

        # 'chunked' encoding results in error 400 from Cloudflare, removing it still keeps response chunked anyway
        if 'Transfer-Encoding' in headers:
            del headers['Transfer-Encoding']

        # Use value of 'Authorization: Bearer' to fill 'X-Forwarded-User' and remove 'Authorization' header

        match = re.match('Bearer (.*)', headers['Authorization'])
        if match:
            headers['X-Forwarded-User'] = match.group(1)
            if 'Authorization' in headers:
                del headers['Authorization']

        # Forward the request to target
        async with session.request(
            method=request.method,
            url=f'{target_url}{request.path_qs}',
            headers=headers,
            data=await request.read()
        ) as response:
            if random.random() < u2f_challenge_chance:
                headers = dict(response.headers)
                headers['X-Sourcegraph-U2f-Challenge'] = 'true'
                proxy_response = web.StreamResponse(
                    status=401,
                    headers=headers
                )
                await proxy_response.prepare(request)
                await proxy_response.write_eof()
                return proxy_response

            proxy_response = web.StreamResponse(
                status=response.status,
                headers=response.headers
            )

            await proxy_response.prepare(request)

            # Stream the response back
            async for chunk in response.content.iter_chunks():
                await proxy_response.write(chunk[0])

            await proxy_response.write_eof()
            return proxy_response

app = web.Application()
app.router.add_route('*', '/{path_info:.*}', proxy_handler)

"""
Reverse Proxy Server for testing External Auth Providers in Cody

This script implements a simple reverse proxy server to facilitate testing of external authentication providers
with Cody. It's role is to simulate simulate HTTP authentication proxy setups. It handles incoming requests by:
- Forwarding them to a target Sourcegraph instance
- Converting Bearer tokens from Authorization headers into X-Forwarded-User headers
- Managing request/response streaming
- Handling header modifications required for Cloudflare compatibility

Target Sourcegraph instance needs to be configured to use HTTP authentication proxies
as described in https://sourcegraph.com/docs/admin/auth#http-authentication-proxies
"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='External auth provider test proxy server')
    parser.add_argument('target_url', help='Target Sourcegraph instance URL to proxy to')
    parser.add_argument('proxy_port', type=int, nargs='?', default=5555,
                       help='Port for the proxy server (default: %(default)s)')
    parser.add_argument('u2f_challenge_chance', help='Defines chance that proxy will respond with U2F challenge; Accepts values from 0 to 1', type=float, nargs='?', default=0)

    args = parser.parse_args()

    target_url = args.target_url.rstrip('/')
    port = args.proxy_port
    u2f_challenge_chance= args.u2f_challenge_chance

    print(f'Starting proxy server on port {port} targeting {target_url}...')
    web.run_app(app, port=port)
