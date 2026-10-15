"""Shared httpx client for the fixed set of API hosts (Tavily, Wikipedia, Fish Audio, Sarvam).

Reusing connections skips a TLS handshake per call. httpx's default keepalive window (5s) is
shorter than the gap between agent turns, so it's raised here. Set timeouts per request.
"""
import httpx

client = httpx.AsyncClient(limits=httpx.Limits(keepalive_expiry=60.0))
