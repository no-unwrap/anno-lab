# Deployment Guide

This guide covers all deployment options for the anno-lab annotation platform. Choose the option that best fits your infrastructure needs, budget, and maintenance preferences.

---

## Table of Contents

1. [Local Development (Docker Compose)](#local-development-docker-compose)
2. [DigitalOcean App Platform](#digitalocean-app-platform)
3. [Heroku](#heroku)
4. [AWS ECS Fargate](#aws-ecs-fargate)
5. [Render](#render)
6. [Self-Hosted](#self-hosted)
7. [S3 Plugin Migration](#s3-plugin-migration)

---

## Local Development (Docker Compose)

### Prerequisites

- Docker Desktop (includes Docker Engine and Docker Compose)
- Git
- At least 4GB available RAM
- 2 CPU cores minimum

### Configuration Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd anno-lab
   ```

2. **Copy environment configuration:**
   ```bash
   cp .env.example .env
   ```

3. **Customize `.env` for local development:**
   ```bash
   DJANGO_SECRET_KEY=your-local-dev-secret-key
   DJANGO_DEBUG=1
   DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
   PUBLIC_BASE_URL=http://localhost:8000
   ```

4. **Start services:**
   ```bash
   docker compose up -d db redis
   docker compose up -d web worker beat
   ```

5. **Verify services are running:**
   ```bash
   docker compose ps
   ```

6. **Access the application:**
   - API Root: http://localhost:8000/api/
   - Swagger UI: http://localhost:8000/api/docs/
   - OpenAPI Schema: http://localhost:8000/api/schema/

### Environment Variables

| Variable | Value |
|----------|-------|
| `DJANGO_SECRET_KEY` | Generate unique key: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DJANGO_DEBUG` | `1` (development only) |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` |
| `POSTGRES_DB` | `anno_lab` |
| `POSTGRES_USER` | `anno_lab` |
| `POSTGRES_PASSWORD` | Strong password |
| `POSTGRES_HOST` | `db` |
| `POSTGRES_PORT` | `5432` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `PUBLIC_BASE_URL` | `http://localhost:8000` |
| `AWS_REGION` | `us-west-2` |
| `AWS_ACCESS_KEY_ID` | (optional, for MTurk) |
| `AWS_SECRET_ACCESS_KEY` | (optional, for MTurk) |
| `S3_BUCKET` | (optional, for plugin storage) |
| `MTURK_SANDBOX` | `1` (test mode) |

### Cost Estimates

- **Cost:** Free
- **Notes:** Uses local compute resources; no cloud infrastructure costs

### Pros/Cons

**Pros:**
- Zero infrastructure costs
- Instant feedback during development
- Full control over environment
- Easy to iterate on frontend plugins
- Can test full workflow locally

**Cons:**
- Limited to local machine resources
- Not suitable for team collaboration
- No persistence when Docker is reset
- Requires Docker installation and system resources

### Common Tasks

**View logs:**
```bash
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f beat
```

**Access Django shell:**
```bash
docker compose exec web python manage.py shell
```

**Run migrations:**
```bash
docker compose exec web python manage.py migrate
```

**Stop all services:**
```bash
docker compose down
```

**Reset database:**
```bash
docker compose down -v  # Removes volumes
docker compose up -d db redis
docker compose up -d web  # Runs migrations automatically
```

---

## DigitalOcean App Platform

### Prerequisites

- DigitalOcean account (https://digitalocean.com)
- GitHub repository with code
- DigitalOcean Personal Access Token
- Heroku-style PostgreSQL and Redis managed services (or self-hosted)

### Configuration Steps

1. **Prepare GitHub repository:**
   - Ensure `.env.example` is committed
   - Add `Procfile` for process management (optional):
     ```
     web: gunicorn anno_lab.wsgi:application --bind 0.0.0.0:$PORT --workers 4
     worker: celery -A anno_lab worker -l INFO -Q default,mturk
     beat: celery -A anno_lab beat -l INFO
     ```

2. **Create DigitalOcean App:**
   - Log into DigitalOcean dashboard
   - Click "Create" → "App"
   - Select GitHub repository
   - Configure deployment source to main branch

3. **Create managed services:**
   - PostgreSQL Database:
     - DigitalOcean Console → "Create" → "Managed Database"
     - Select PostgreSQL 16
     - Choose size based on usage (minimum: Basic $15/month)
     - Note the connection string

   - Redis Cache:
     - DigitalOcean Console → "Create" → "Managed Database"
     - Select Redis
     - Choose size (minimum: Basic $15/month)
     - Note the connection string

4. **Configure environment variables in App Platform:**
   ```
   DJANGO_SECRET_KEY=<generate-new-key>
   DJANGO_DEBUG=0
   DJANGO_ALLOWED_HOSTS=<your-app-domain>
   POSTGRES_HOST=<db-host-from-connection-string>
   POSTGRES_PORT=5432
   POSTGRES_DB=defaultdb
   POSTGRES_USER=doadmin
   POSTGRES_PASSWORD=<password-from-connection-string>
   REDIS_URL=<redis-connection-string>
   PUBLIC_BASE_URL=https://<your-app-domain>
   AWS_REGION=us-west-2
   AWS_ACCESS_KEY_ID=<your-key>
   AWS_SECRET_ACCESS_KEY=<your-secret>
   S3_BUCKET=<your-bucket>
   MTURK_SANDBOX=0
   ```

5. **Configure HTTP routes:**
   - Set port to `8000`
   - Set health check path to `/api/schema/`

6. **Deploy:**
   - App Platform will auto-deploy on git push
   - View logs in DigitalOcean dashboard

### Environment Variables

See Configuration Steps section for complete list. Key differences from local:
- `DJANGO_DEBUG=0` (production mode)
- `DJANGO_ALLOWED_HOSTS=<your-domain>` (required for CSRF protection)
- Database/Redis credentials from managed services
- `PUBLIC_BASE_URL=https://<domain>` (HTTPS required)

### Cost Estimates

| Component | Size | Cost/Month |
|-----------|------|-----------|
| App Platform (web) | Basic | $12 |
| PostgreSQL Database | Basic | $15 |
| Redis Cache | Basic | $15 |
| **Total (minimum)** | | **$42** |

**Scaling:**
- App Platform auto-scaling: $12-40/month per container
- Database upgrades: $15-$100+/month depending on size
- Redis upgrades: $15-$50/month depending on size

### Pros/Cons

**Pros:**
- Simple deployment via git push
- Managed databases reduce ops burden
- Built-in SSL/TLS
- Easy to scale
- Good documentation
- App Platform has generous free tier ($12/month credit)

**Cons:**
- More expensive than some alternatives at scale
- Limited customization of infrastructure
- Vendor lock-in (DigitalOcean services)
- Managed services add cost even for small apps

---

## Heroku

### Prerequisites

- Heroku account (https://heroku.com)
- Heroku CLI installed locally
- GitHub repository with code

### Configuration Steps

1. **Install Heroku CLI:**
   ```bash
   brew tap heroku/brew && brew install heroku
   heroku login
   ```

2. **Create Heroku app:**
   ```bash
   heroku create your-app-name
   ```

3. **Add PostgreSQL addon:**
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

4. **Add Redis addon:**
   ```bash
   heroku addons:create heroku-redis:premium-0
   ```

5. **Create `Procfile` in repository root:**
   ```
   web: gunicorn anno_lab.wsgi:application --bind 0.0.0.0:$PORT --workers 4
   worker: celery -A anno_lab worker -l INFO -Q default,mturk
   beat: celery -A anno_lab beat -l INFO
   ```

6. **Set environment variables:**
   ```bash
   heroku config:set DJANGO_SECRET_KEY=$(python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
   heroku config:set DJANGO_DEBUG=0
   heroku config:set DJANGO_ALLOWED_HOSTS=your-app-name.herokuapp.com
   heroku config:set PUBLIC_BASE_URL=https://your-app-name.herokuapp.com
   heroku config:set AWS_REGION=us-west-2
   heroku config:set AWS_ACCESS_KEY_ID=your-key
   heroku config:set AWS_SECRET_ACCESS_KEY=your-secret
   heroku config:set S3_BUCKET=your-bucket
   heroku config:set MTURK_SANDBOX=0
   ```

7. **Deploy:**
   ```bash
   git push heroku main
   ```

8. **Run migrations:**
   ```bash
   heroku run python backend/manage.py migrate
   ```

9. **Verify deployment:**
   ```bash
   heroku logs --tail
   heroku ps
   ```

10. **Scale workers (optional):**
    ```bash
    heroku ps:scale worker=2 beat=1
    ```

### Environment Variables

Heroku automatically sets:
- `DATABASE_URL` (from PostgreSQL addon, Django auto-detects)
- `REDIS_URL` (from Redis addon, set explicitly)

Additionally configure:
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=0`
- `DJANGO_ALLOWED_HOSTS=<your-domain>`
- `PUBLIC_BASE_URL=https://<your-domain>`
- AWS credentials if using MTurk or S3
- `S3_BUCKET`
- `MTURK_SANDBOX=0` (if using MTurk in production)

### Cost Estimates

| Component | Size | Cost/Month |
|-----------|------|-----------|
| Web Dyno | Standard 1x | $25 |
| Worker Dyno | Standard 1x | $25 |
| Beat Dyno | Standard 1x | $25 |
| PostgreSQL | Essential | $9 |
| Redis | Premium | $30 |
| **Total (minimum)** | | **$114** |

**Notes:**
- Heroku discontinued free tier (Nov 2022)
- Minimum economical setup: 1 Web + 1 Worker + 1 Beat
- Can run web + worker/beat in single dyno if low traffic
- Redis pricing varies by data size

### Pros/Cons

**Pros:**
- Excellent documentation and community
- Simple git push deployments
- Managed databases included
- Good for rapid prototyping
- Heroku Postgres backups built-in
- Teams and collaboration features

**Cons:**
- More expensive than competitors
- Less control over infrastructure
- Dyno hours limited (cannot run 24/7 on cheapest tier)
- Vendor lock-in
- Sluggish app startup after sleep (if using free dynos)

---

## AWS ECS Fargate

### Prerequisites

- AWS Account
- AWS CLI configured locally
- Docker image pushed to ECR (Elastic Container Registry)
- RDS PostgreSQL instance (or managed database)
- ElastiCache Redis cluster
- IAM roles and policies configured
- Application Load Balancer (ALB) or Network Load Balancer (NLB)

### Configuration Steps

1. **Create ECR repository:**
   ```bash
   aws ecr create-repository --repository-name anno-lab --region us-west-2
   ```

2. **Build and push Docker image:**
   ```bash
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.us-west-2.amazonaws.com

   docker build -t anno-lab:latest .

   docker tag anno-lab:latest <your-account-id>.dkr.ecr.us-west-2.amazonaws.com/anno-lab:latest

   docker push <your-account-id>.dkr.ecr.us-west-2.amazonaws.com/anno-lab:latest
   ```

3. **Create RDS PostgreSQL instance:**
   - AWS Console → RDS → Create Database
   - Engine: PostgreSQL 16
   - Instance class: db.t4g.micro (minimum for testing)
   - Storage: 20GB gp3 (minimum)
   - Create database named `anno-lab`
   - Note the endpoint and credentials

4. **Create ElastiCache Redis cluster:**
   - AWS Console → ElastiCache → Create Cluster
   - Engine: Redis
   - Node type: cache.t4g.micro (minimum)
   - Number of replicas: 1 (for HA)
   - Note the endpoint

5. **Create ECS Cluster:**
   - AWS Console → ECS → Create Cluster
   - Select "Networking only" (Fargate compatible)
   - Configure VPC/subnets

6. **Create CloudWatch Log Group:**
   ```bash
   aws logs create-log-group --log-group-name /ecs/anno-lab --region us-west-2
   ```

7. **Create Task Definition (JSON):**
   ```json
   {
     "family": "anno-lab",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "512",
     "memory": "1024",
     "containerDefinitions": [
       {
         "name": "web",
         "image": "<your-account-id>.dkr.ecr.us-west-2.amazonaws.com/anno-lab:latest",
         "essential": true,
         "portMappings": [
           {
             "containerPort": 8000,
             "hostPort": 8000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           { "name": "DJANGO_SECRET_KEY", "value": "your-secret-key" },
           { "name": "DJANGO_DEBUG", "value": "0" },
           { "name": "DJANGO_ALLOWED_HOSTS", "value": "your-domain.com" },
           { "name": "POSTGRES_HOST", "value": "your-rds-endpoint" },
           { "name": "POSTGRES_DB", "value": "anno_lab" },
           { "name": "POSTGRES_USER", "value": "postgres" },
           { "name": "POSTGRES_PORT", "value": "5432" },
           { "name": "REDIS_URL", "value": "redis://your-redis-endpoint:6379/0" },
           { "name": "PUBLIC_BASE_URL", "value": "https://your-domain.com" },
           { "name": "AWS_REGION", "value": "us-west-2" }
         ],
         "secrets": [
           { "name": "POSTGRES_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-west-2:account:secret:postgres-password" },
           { "name": "AWS_ACCESS_KEY_ID", "valueFrom": "arn:aws:secretsmanager:us-west-2:account:secret:aws-access-key" },
           { "name": "AWS_SECRET_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:us-west-2:account:secret:aws-secret-key" }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/anno-lab",
             "awslogs-region": "us-west-2",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ],
     "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
     "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole"
   }
   ```

8. **Register task definition:**
   ```bash
   aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-west-2
   ```

9. **Create ECS Service:**
   - AWS Console → ECS → Cluster → Create Service
   - Launch type: FARGATE
   - Task definition: anno-lab
   - Number of tasks: 2 (for HA)
   - Load balancer: Create ALB
   - Target group: port 8000
   - Health check path: `/api/schema/`

10. **Auto-scaling (optional):**
    ```bash
    aws application-autoscaling register-scalable-target \
      --service-namespace ecs \
      --resource-id service/your-cluster/your-service \
      --scalable-dimension ecs:service:DesiredCount \
      --min-capacity 2 \
      --max-capacity 10 \
      --region us-west-2
    ```

### Environment Variables

Use AWS Secrets Manager for sensitive values:
- `POSTGRES_PASSWORD`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DJANGO_SECRET_KEY`

Use environment variables for non-sensitive:
- `DJANGO_DEBUG=0`
- `DJANGO_ALLOWED_HOSTS=<domain>`
- `POSTGRES_HOST=<rds-endpoint>`
- `POSTGRES_DB=anno_lab`
- `POSTGRES_USER=postgres`
- `POSTGRES_PORT=5432`
- `REDIS_URL=redis://<elasticache-endpoint>:6379/0`
- `PUBLIC_BASE_URL=https://<domain>`
- `AWS_REGION=us-west-2`
- `S3_BUCKET=<your-bucket>`
- `MTURK_SANDBOX=0`

### Cost Estimates

| Component | Size | Cost/Month |
|-----------|------|-----------|
| ECS Fargate (2 tasks) | 512 CPU, 1GB RAM | ~$29 |
| RDS PostgreSQL | db.t4g.micro | $13 |
| ElastiCache Redis | cache.t4g.micro | $20 |
| Application Load Balancer | Standard | $16 |
| Data transfer | 100GB/month | ~$10 |
| **Total (minimum)** | | **~$88** |

**Scaling costs:**
- Additional Fargate tasks: ~$14.50 per 512 CPU/1GB RAM
- RDS larger instances: $25-$100+/month
- ElastiCache larger nodes: $20-$100+/month

### Pros/Cons

**Pros:**
- Highly scalable and performant
- Fine-grained control over infrastructure
- Pay-per-use pricing (only for running tasks)
- Can integrate with other AWS services
- Excellent for complex deployments
- Good documentation and tooling

**Cons:**
- Complex setup and configuration
- Steep learning curve (AWS ecosystem)
- More overhead for small applications
- Requires AWS expertise
- Multiple components to manage
- Potential for surprising costs if not monitored

---

## Render

### Prerequisites

- Render account (https://render.com)
- GitHub repository with code
- Docker image (Render builds from Dockerfile)
- The checked-in Dockerfile now copies `frontends/` into the image, so local-filesystem plugin asset serving works by default as long as you rebuild after frontend bundle changes

### Configuration Steps

1. **Create GitHub connection:**
   - Log into Render dashboard
   - Click "New +" → "Web Service"
   - Select GitHub repository
   - Authorize Render to access GitHub

2. **Configure web service:**
   - Name: `anno-lab` (or desired service name)
   - Environment: Docker
   - Region: Select closest to users
   - Plan: Standard ($7/month)
   - Branch: main
   - Build command: (default)
   - Start command: (default from Dockerfile)

3. **Create PostgreSQL database:**
   - Render Dashboard → "New +" → "PostgreSQL"
   - Name: `anno-lab-db`
   - Database: `anno_lab`
   - Region: Same as web service
   - Plan: Standard ($7/month)
   - Note the connection string

4. **Create Redis cache:**
   - Render Dashboard → "New +" → "Redis"
   - Name: `anno-lab-redis`
   - Region: Same as web service
   - Plan: Standard ($7/month)
   - Note the connection string

5. **Set environment variables in web service:**
   - Go to service settings → Environment
   - Add variables:
     ```
     DJANGO_SECRET_KEY=<generate-new>
     DJANGO_DEBUG=0
     DJANGO_ALLOWED_HOSTS=<your-service-name>.onrender.com
     POSTGRES_HOST=<from-postgres-connection-string>
     POSTGRES_PORT=5432
     POSTGRES_DB=anno_lab
     POSTGRES_USER=<from-postgres-connection-string>
     POSTGRES_PASSWORD=<from-postgres-connection-string>
     REDIS_URL=<from-redis-connection-string>
     PUBLIC_BASE_URL=https://<your-service-name>.onrender.com
     AWS_REGION=us-west-2
     AWS_ACCESS_KEY_ID=<your-key>
     AWS_SECRET_ACCESS_KEY=<your-secret>
     S3_BUCKET=<your-bucket>
     MTURK_SANDBOX=0
     ```

6. **Create background worker service (for Celery):**
   - Dashboard → "New +" → "Background Worker"
   - Name: `anno-lab-worker`
   - Environment: Docker
   - Select same GitHub repository
   - Build command: (default)
   - Start command: `celery -A anno_lab worker -l INFO -Q default,mturk`
   - Plan: Standard ($7/month)
   - Set same environment variables as web service

7. **Create Cron job service (for Beat):**
   - Dashboard → "New +" → "Background Worker"
   - Name: `anno-lab-beat`
   - Environment: Docker
   - Build command: (default)
   - Start command: `celery -A anno_lab beat -l INFO`
   - Plan: Standard ($7/month)
   - Set same environment variables as web service

8. **Configure health check (web service only):**
   - Service settings → Health Check Path: `/api/schema/`

9. **Deploy:**
   - Render auto-deploys on git push
   - Monitor deployment in dashboard
   - View logs in real-time

### Environment Variables

Same as DigitalOcean App Platform. Key points:
- Database connection string provided by Render
- Redis connection string provided by Render
- Sensitive variables can be stored as "Secret" environment variables (not visible in logs)
- All variables available to background workers as well

### Cost Estimates

| Component | Plan | Cost/Month |
|-----------|------|-----------|
| Web Service | Standard | $7 |
| Worker Service | Standard | $7 |
| Beat Service | Standard | $7 |
| PostgreSQL | Standard | $7 |
| Redis | Standard | $7 |
| **Total (minimum)** | | **$35** |

**Scaling:**
- Plus plan (web): $12/month (includes metrics, more resources)
- Professional plan (web): $19/month (advanced features)
- Database upgrades: $12-$100+/month
- Redis upgrades: $12-$50+/month

### Pros/Cons

**Pros:**
- Very affordable entry price ($7/month per service)
- Simple, modern interface
- Auto-deployment from GitHub
- Managed databases included
- Great customer support
- No vendor complexity (simpler than AWS)

**Cons:**
- Limited customization compared to AWS
- Smaller ecosystem than Heroku
- Newer platform (less proven)
- Limited geographic regions
- No free tier (unlike DigitalOcean)

---

## Self-Hosted

### Prerequisites

- Server/VPS with Linux OS
- SSH access with sudo privileges
- Minimum specs:
  - 2 CPU cores
  - 4GB RAM
  - 20GB SSD storage
  - Stable internet connection
- Domain name with DNS access
- SSL certificate (auto-provisioned via Let's Encrypt)

### Configuration Steps

1. **Provision server:**
   - VPS provider options: DigitalOcean Droplets, Vultr, Hetzner, Linode, AWS EC2, etc.
   - OS: Ubuntu 22.04 LTS or similar
   - Minimum: 2 CPU, 4GB RAM, 20GB SSD
   - SSH into server and update:
     ```bash
     sudo apt-get update && sudo apt-get upgrade -y
     ```

2. **Install dependencies:**
   ```bash
   sudo apt-get install -y \
     git python3.11 python3.11-venv python3-pip \
     postgresql postgresql-contrib \
     redis-server \
     nginx \
     certbot python3-certbot-nginx \
     supervisor \
     curl
   ```

3. **Clone application:**
   ```bash
   cd /opt
   sudo git clone <repository-url> anno-lab
   sudo chown -R ubuntu:ubuntu anno-lab  # Replace 'ubuntu' with your user
   ```

4. **Setup Python virtual environment:**
   ```bash
   cd /opt/anno-lab
   python3.11 -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

5. **Configure PostgreSQL:**
   ```bash
   sudo -u postgres psql <<SQL
   CREATE DATABASE anno_lab;
   CREATE USER anno_lab WITH PASSWORD 'your-secure-password';
   ALTER ROLE anno_lab SET client_encoding TO 'utf8';
   ALTER ROLE anno_lab SET default_transaction_isolation TO 'read committed';
   ALTER ROLE anno_lab SET default_transaction_deferrable TO on;
   ALTER ROLE anno_lab SET timezone TO 'UTC';
   GRANT ALL PRIVILEGES ON DATABASE anno_lab TO anno_lab;
   \q
   SQL
   ```

6. **Create `.env` file:**
   ```bash
   cp .env.example /opt/anno-lab/.env
   ```

   Edit `.env`:
   ```
   DJANGO_SECRET_KEY=<generate-new-key>
   DJANGO_DEBUG=0
   DJANGO_ALLOWED_HOSTS=your-domain.com
   POSTGRES_DB=anno_lab
   POSTGRES_USER=anno_lab
   POSTGRES_PASSWORD=your-secure-password
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   REDIS_URL=redis://localhost:6379/0
   PUBLIC_BASE_URL=https://your-domain.com
   AWS_REGION=us-west-2
   AWS_ACCESS_KEY_ID=<your-key>
   AWS_SECRET_ACCESS_KEY=<your-secret>
   S3_BUCKET=<your-bucket>
   MTURK_SANDBOX=0
   ```

7. **Run migrations:**
   ```bash
   cd /opt/anno-lab
   source venv/bin/activate
   python backend/manage.py migrate
   python backend/manage.py collectstatic --noinput
   ```

8. **Configure Gunicorn:**
   Create `/opt/anno-lab/gunicorn_config.py`:
   ```python
   bind = "127.0.0.1:8000"
   workers = 4
   worker_class = "sync"
   timeout = 120
   keepalive = 5
   max_requests = 1000
   max_requests_jitter = 50
   access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(r)s"'
   ```

9. **Create supervisor configs:**

   `/etc/supervisor/conf.d/anno-lab-web.conf`:
   ```ini
   [program:anno-lab-web]
   command=/opt/anno-lab/venv/bin/gunicorn \
       --config /opt/anno-lab/gunicorn_config.py \
       anno_lab.wsgi:application
   directory=/opt/anno-lab/backend
   user=ubuntu
   autostart=true
   autorestart=true
   stdout_logfile=/var/log/anno-lab-web.log
   stderr_logfile=/var/log/anno-lab-web.log
   environment=PATH="/opt/anno-lab/venv/bin",DJANGO_SETTINGS_MODULE="anno_lab.settings"
   ```

   `/etc/supervisor/conf.d/anno-lab-worker.conf`:
   ```ini
   [program:anno-lab-worker]
   command=/opt/anno-lab/venv/bin/celery \
       -A anno_lab worker \
       -l INFO \
       -Q default,mturk \
       -c 4
   directory=/opt/anno-lab/backend
   user=ubuntu
   autostart=true
   autorestart=true
   stdout_logfile=/var/log/anno-lab-worker.log
   stderr_logfile=/var/log/anno-lab-worker.log
   environment=PATH="/opt/anno-lab/venv/bin"
   ```

   `/etc/supervisor/conf.d/anno-lab-beat.conf`:
   ```ini
   [program:anno-lab-beat]
   command=/opt/anno-lab/venv/bin/celery \
       -A anno_lab beat \
       -l INFO
   directory=/opt/anno-lab/backend
   user=ubuntu
   autostart=true
   autorestart=true
   stdout_logfile=/var/log/anno-lab-beat.log
   stderr_logfile=/var/log/anno-lab-beat.log
   environment=PATH="/opt/anno-lab/venv/bin"
   ```

10. **Update supervisor:**
    ```bash
    sudo supervisorctl reread
    sudo supervisorctl update
    sudo supervisorctl start all
    ```

11. **Configure Nginx reverse proxy:**

    Create `/etc/nginx/sites-available/anno-lab`:
    ```nginx
    upstream anno_lab {
        server 127.0.0.1:8000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        client_max_body_size 100M;

        location / {
            proxy_pass http://anno_lab;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect off;
        }
    }
    ```

    Enable site:
    ```bash
    sudo ln -s /etc/nginx/sites-available/anno-lab /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

12. **Setup SSL with Let's Encrypt:**
    ```bash
    sudo certbot --nginx -d your-domain.com
    ```

    Auto-renew:
    ```bash
    sudo systemctl enable certbot.timer
    sudo systemctl start certbot.timer
    ```

13. **Setup automatic updates:**
    ```bash
    sudo apt-get install -y unattended-upgrades
    sudo dpkg-reconfigure -plow unattended-upgrades
    ```

### Environment Variables

See `.env` file configuration above. All variables must be in `/opt/anno-lab/.env` for supervisor to access.

### Cost Estimates

| Component | Size | Cost/Month |
|-----------|------|-----------|
| VPS (2CPU, 4GB RAM) | Standard | $5-15 |
| Domain name | .com | $10-15 |
| **Total (minimum)** | | **$15-30** |

**Notes:**
- VPS pricing varies by provider (DigitalOcean Droplet: $6, Hetzner: ~$5, Vultr: $6)
- Domain costs vary by registrar
- No managed database costs (self-hosted PostgreSQL/Redis on VPS)
- Backup solutions additional (e.g., AWS S3: $0.02/GB)

### Pros/Cons

**Pros:**
- Cheapest long-term solution
- Full control over environment
- No vendor lock-in
- Can customize everything
- Good for learning infrastructure
- Data stays on your infrastructure

**Cons:**
- Requires server administration skills
- Security is your responsibility (updates, patches, firewalls)
- No automatic backups (must set up yourself)
- Manual scaling and load balancing
- More operational overhead
- Downtime during maintenance
- Single point of failure (unless you setup redundancy)

### Common Maintenance Tasks

**Update application:**
```bash
cd /opt/anno-lab
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
python backend/manage.py migrate
python backend/manage.py collectstatic --noinput
sudo supervisorctl restart anno-lab-web
```

**Monitor logs:**
```bash
tail -f /var/log/anno-lab-web.log
tail -f /var/log/anno-lab-worker.log
tail -f /var/log/anno-lab-beat.log
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**Backup database:**
```bash
sudo -u postgres pg_dump anno_lab > backup-$(date +%Y%m%d).sql
```

**Restore database:**
```bash
sudo -u postgres psql anno_lab < backup-20240101.sql
```

---

## S3 Plugin Migration

### Overview

For production deployments, it's recommended to upload frontend plugins to S3 and serve them from there, rather than bundling them with the application. This allows for:

- Decoupled plugin updates without redeploying the web service
- Faster frontend updates via CDN
- Reduced application image size
- Version-specific plugin URLs for long-lived research data

### Prerequisites

- AWS account with S3 access
- AWS CLI configured locally
- S3 bucket created (e.g., `my-annotation-plugins`)
- IAM user with S3 permissions (or use AWS credentials)
- Frontend plugins built locally (npm run build)

### Setup Steps

1. **Create S3 bucket:**
   ```bash
   aws s3 mb s3://my-annotation-plugins --region us-west-2
   ```

2. **Configure bucket for public read access:**

   Bucket Policy (AWS Console → S3 → Bucket → Permissions → Bucket Policy):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::my-annotation-plugins/*"
       }
     ]
   }
   ```

3. **Build plugins locally:**
   ```bash
   cd frontends/salient-poly
   npm install
   npm run build
   cd ../..
   ```

4. **Upload plugins using the deploy script:**

   The repository includes `/deploy/upload_plugins.sh` for automated uploading:

   ```bash
   ./deploy/upload_plugins.sh my-annotation-plugins
   ```

   Or with AWS profile:
   ```bash
   AWS_PROFILE=myprofile ./deploy/upload_plugins.sh my-annotation-plugins
   ```

   Or with environment variable:
   ```bash
   PLUGIN_S3_BUCKET=my-annotation-plugins ./deploy/upload_plugins.sh
   ```

5. **Configure application to use S3 plugins:**

   Set environment variables:
   ```bash
   USE_S3_PLUGINS=1
   PLUGIN_S3_BUCKET=my-annotation-plugins
   # OR
   S3_BUCKET=my-annotation-plugins
   ```

### Upload Script Details

The `deploy/upload_plugins.sh` script:

1. Validates S3 bucket is specified
2. Scans `frontends/` directory for plugin manifests
3. For each plugin with `manifest.json`:
   - Extracts version from manifest
   - Extracts build output root directory (default: `dist`)
   - Uploads built files to `s3://bucket/plugins/plugin-name/version/`
   - Sets cache headers for immutable assets (1 year TTL)
   - Excludes source maps

Example output:
```
Uploading plugins to s3://my-annotation-plugins/plugins/
Uploading salient-poly (v1.2.3) from dist...
  ✓ Uploaded to s3://my-annotation-plugins/plugins/salient-poly/1.2.3/
Plugin upload complete!

To use S3 plugins in production, set these environment variables:
  USE_S3_PLUGINS=1
  PLUGIN_S3_BUCKET=my-annotation-plugins
```

### Integration with Django

The backend detects `USE_S3_PLUGINS=1` at request time and keeps the stored
manifest paths unchanged. When a browser requests a plugin asset through Django,
`plugin_asset` generates a short-lived presigned S3 URL and redirects the browser
to that object:

- `FrontendPlugin.manifest.root`, `js`, and `css` remain relative paths in the DB
- Django resolves those paths under the configured plugin version
- the browser receives an HTTP redirect to a presigned S3 object URL

Set both environment variables on the backend:

```bash
USE_S3_PLUGINS=1
PLUGIN_S3_BUCKET=my-annotation-plugins
```

### Versioning Strategy

Each plugin version is stored separately:
```
s3://my-annotation-plugins/
├── plugins/
│   ├── salient-poly/
│   │   ├── 1.0.0/
│   │   │   ├── assets/
│   │   │   │   ├── index.js
│   │   │   │   └── index.css
│   │   │   └── index.html
│   │   ├── 1.1.0/
│   │   │   ├── assets/
│   │   │   └── index.html
│   │   └── 1.2.3/
│   │       ├── assets/
│   │       └── index.html
```

This approach ensures:
- Long-lived annotations always use the exact plugin version they were created with
- Multiple versions can coexist for gradual rollouts
- Cache never conflicts between versions (immutable URLs)

### Continuous Integration Example

Add to CI/CD pipeline (GitHub Actions):

```yaml
- name: Build frontend plugins
  run: |
    cd frontends/salient-poly
    npm install
    npm run build
    cd ../..

- name: Upload plugins to S3
  env:
    AWS_REGION: us-west-2
    PLUGIN_S3_BUCKET: my-annotation-plugins
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    ./deploy/upload_plugins.sh
```

### Troubleshooting

**Plugin not uploading:**
- Ensure `manifest.json` exists in plugin directory
- Check S3 bucket name is correct
- Verify AWS credentials have S3 permissions
- Ensure build directory exists (run `npm run build` first)

**Plugin loads but styling is broken:**
- Check S3 bucket has public read policy
- Verify CloudFront/CDN caching isn't serving stale files
- Clear browser cache
- Check S3 path matches manifest URLs

**Version mismatch between frontend and backend:**
- Ensure manifest.json version matches package.json
- Update manifest before uploading
- Clear old versions from S3 if needed

---

## Deployment Comparison Summary

| Feature | Docker | DigitalOcean | Heroku | AWS ECS | Render | Self-Hosted |
|---------|--------|-------------|--------|---------|--------|------------|
| **Cost** | Free | $42+ | $114+ | $88+ | $35+ | $15-30 |
| **Setup Time** | <5 min | 10-15 min | 5-10 min | 30-60 min | 10-15 min | 1-2 hours |
| **Scaling** | Manual | Easy | Easy | Very Easy | Easy | Manual |
| **Ops Burden** | Low | Low | Low | Medium | Low | High |
| **Customization** | High | Medium | Low | Very High | Medium | Very High |
| **Vendor Lock-in** | None | DigitalOcean | Heroku | AWS | Render | None |
| **Best For** | Development | Small-medium | Rapid prototyping | Large scale | Budget-conscious | Full control |

---

## Checklist Before Production Deployment

- [ ] Generate secure `DJANGO_SECRET_KEY` (not the example value)
- [ ] Set `DJANGO_DEBUG=0` in production
- [ ] Configure `DJANGO_ALLOWED_HOSTS` with actual domain
- [ ] Set `PUBLIC_BASE_URL` to HTTPS domain
- [ ] Set `CORS_ALLOW_ALL_ORIGINS=0` and populate `CORS_ALLOWED_ORIGINS` with the real frontend origins
- [ ] Set a non-empty `DJANGO_WRITE_TOKEN` before exposing write APIs outside local development
- [ ] Use strong database password
- [ ] If using a managed platform that injects `DATABASE_URL`, confirm the value points at the intended production database
- [ ] Configure AWS credentials for S3/MTurk (if needed)
- [ ] If serving plugins from S3, set `USE_S3_PLUGINS=1` and `PLUGIN_S3_BUCKET=<bucket>`
- [ ] Setup SSL/TLS certificate (Let's Encrypt recommended)
- [ ] Enable HTTPS redirect in Nginx/ALB
- [ ] Configure database backups
- [ ] Setup log aggregation/monitoring
- [ ] Test migrations in staging environment
- [ ] Configure monitoring and alerting
- [ ] Setup CI/CD for automated deployments
- [ ] Document rollback procedure
- [ ] Test disaster recovery procedure
- [ ] Configure rate limiting on API endpoints
- [ ] Setup CSRF protection (Django middleware enabled by default)
- [ ] Review security headers (HSTS, CSP, X-Frame-Options)

---

## Additional Resources

- [Django Deployment Checklist](https://docs.djangoproject.com/en/stable/howto/deployment/checklist/)
- [Gunicorn Configuration](https://docs.gunicorn.org/en/stable/settings.html)
- [Celery Configuration](https://docs.celeryproject.org/en/stable/django/)
- [PostgreSQL Backups](https://www.postgresql.org/docs/current/backup.html)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Docker Documentation](https://docs.docker.com/)
