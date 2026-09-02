FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py migrate.py ./
COPY migrations ./migrations

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
