def test_metrics_endpoint_exposes_prometheus_payload(client) -> None:
    health_response = client.get("/health")
    assert health_response.status_code == 200

    metrics_response = client.get("/metrics")
    assert metrics_response.status_code == 200
    assert "trip_archive_http_requests_total" in metrics_response.text
    assert "trip_archive_http_request_duration_seconds" in metrics_response.text
