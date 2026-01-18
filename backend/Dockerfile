FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 确保数据目录存在
RUN mkdir -p data uploads/originals uploads/thumbnails
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]