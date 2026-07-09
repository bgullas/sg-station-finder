"""
AWS Lambda Function — IoT Core MQTT Proxy
Deploy this as a Lambda with a Function URL (no auth, or IAM auth).
The PWA POSTs: { "topic": "pubc21wl/WLC21_WWS499", "payload": {...} }

Cert files expected in /var/task/certs/<SUFFIX>/ e.g.:
  certs/WWS499/WWS499-certificate.pem.crt
  certs/WWS499/WWS499-private.pem.key
  certs/AmazonRootCA1.pem   (shared root CA)

Or store cert/key as Lambda environment variables per station (base64 encoded).

Required layers / packages: awsiotsdk  (pip install awsiotsdk)
"""

import json, os, tempfile, base64
from awscrt import mqtt
from awsiot import mqtt_connection_builder

ENDPOINT = "a25pxtqsfk9euv-ats.iot.ap-southeast-1.amazonaws.com"
PORT     = 8883
CA_PATH  = os.path.join(os.path.dirname(__file__), "certs", "AmazonRootCA1.pem")


def get_cert_paths(suffix: str):
    """Return (cert_path, key_path) for a station suffix like WWS499."""
    base = os.path.join(os.path.dirname(__file__), "certs", suffix)
    cert = os.path.join(base, f"{suffix}-certificate.pem.crt")
    key  = os.path.join(base, f"{suffix}-private.pem.key")
    if os.path.exists(cert) and os.path.exists(key):
        return cert, key

    # Fallback: env vars (base64) named CERT_WWS499 and KEY_WWS499
    cert_b64 = os.environ.get(f"CERT_{suffix}")
    key_b64  = os.environ.get(f"KEY_{suffix}")
    if cert_b64 and key_b64:
        tmp = tempfile.mkdtemp()
        cert = os.path.join(tmp, "cert.pem")
        key  = os.path.join(tmp, "key.pem")
        with open(cert, "wb") as f: f.write(base64.b64decode(cert_b64))
        with open(key,  "wb") as f: f.write(base64.b64decode(key_b64))
        return cert, key

    raise FileNotFoundError(f"No cert/key found for station suffix '{suffix}'")


def lambda_handler(event, context):
    try:
        body    = json.loads(event.get("body", "{}"))
        topic   = body["topic"]           # e.g. pubc21wl/WLC21_WWS499
        payload = body["payload"]         # dict

        # Derive suffix: WLC21_WWS499 → WWS499
        sid    = payload.get("sid", "")
        suffix = sid.replace("WLC21_", "") if sid.startswith("WLC21_") else sid

        cert_path, key_path = get_cert_paths(suffix)

        conn = mqtt_connection_builder.mtls_from_path(
            endpoint=ENDPOINT,
            port=PORT,
            cert_filepath=cert_path,
            pri_key_filepath=key_path,
            ca_filepath=CA_PATH,
            client_id=f"lambda-proxy-{suffix}",
            clean_session=True,
        )
        connect_future = conn.connect()
        connect_future.result(timeout=10)

        publish_future, _ = conn.publish(
            topic=topic,
            payload=json.dumps(payload),
            qos=mqtt.QoS.AT_LEAST_ONCE,
        )
        publish_future.result(timeout=10)
        conn.disconnect().result(timeout=5)

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"ok": True, "topic": topic}),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": str(e)}),
        }
