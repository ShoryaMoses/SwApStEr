"""Render entrypoint; no automatic migrations or hosted resource changes."""
from dotenv import load_dotenv
load_dotenv()
from backend.deployment import validate
validate()
from backend.main import app
