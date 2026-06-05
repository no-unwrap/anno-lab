import boto3
from django.conf import settings


def get_mturk_client():
    region = settings.AWS_REGION if hasattr(settings, "AWS_REGION") else "us-east-1"
    endpoint = getattr(settings, "MTURK_ENDPOINT", "") or (
        "https://mturk-requester-sandbox.us-east-1.amazonaws.com"
        if settings.MTURK_SANDBOX
        else "https://mturk-requester.us-east-1.amazonaws.com"
    )
    return boto3.client("mturk", region_name=region, endpoint_url=endpoint)
