# CI service configuration access

The first remote run (37275579177) failed before the test gates: storage exited 255 and identity failed startup. The pinned SeaweedFS entrypoint drops root privileges to UID/GID 1000. Keycloak runs as UID 1000/GID 0. Host-generated configuration files previously had mode 0600, which relies on a matching host UID.

The setup helper preserves the host owner, grants only group 1000 read access to the two service configurations, and adds that supplementary group to Keycloak. Environment, authenticator and persona files remain 0600. This is development/test setup; production uses separate secret provisioning.

Verified using files owned by UID 1001: actual pinned Keycloak UID 1000/GID 0 with supplementary group 1000 and SeaweedFS's `su-exec seaweed` can read their configuration; unrelated UID/GID 1002 cannot. Resulting ownership/mode is 1001:1000 / 0640. Shell syntax checks passed. Remote rerun is required to verify startup and all gates.

Startup failures now retain sanitized service logs. Reports and screenshots from earlier runs are cleared before startup, so uploaded evidence describes the current run.
