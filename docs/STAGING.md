# Testing registry images before a stable release

The **Publish staging images** workflow builds, publishes and tests the three
application images for a selected Git branch. It uses the release's native AMD64
and ARM64 build/test/scan workflow, then combines the exact verified digests into
multiarch staging images. It does not create a stable release, Plesk package or
update feed.

Each build uses `staging-<12-character-commit>-<GitHub-run-ID>` as the shared image
tag. A new manual run gets a new tag; rerunning failed jobs keeps the same tag and
reuses matching artifacts. Existing conflicting tags stop publication. There is
no moving `staging` or `latest` tag, and a redeploy keeps the selected build.
The images' application version remains the checked-out package version; commit
metadata and `staging-images.json` identify the exact test build.

## 1. Prepare GitHub

1. In the repository, open **Settings > Environments > New environment**.
2. Name it `container-staging` and select **Configure environment**.
3. No environment secrets, environment variables or personal access token are
   required. The workflow uses GitHub's automatic `GITHUB_TOKEN` with
   `packages: write`. Keep production signing secrets in `release-production`.
4. Commit and push the container implementation, including
   `.github/workflows/staging.yml`. The workflow must be present on the
   repository's default branch before GitHub displays the manual trigger.
   In this repository the default branch is `main`. Publishing the implementation
   there enables testing; production deployments continue to select stable
   releases. If the branch is protected, use the normal reviewed pull request.

GitHub documents [environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
and [registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## 2. Start the first build

1. Open the repository's **Actions** tab.
2. Select **Publish staging images** in the left sidebar.
3. Click **Run workflow**, choose `main` for the first test, then click
   **Run workflow** again. Later, select another branch that contains the current
   workflow and container files.
4. Open the new run. First the existing CI must pass. Next, both native candidate
   jobs build and upload images, test the downloaded digests, verify real worker
   isolation and scan the actual images with Trivy. The final job combines them
   and verifies unauthenticated downloads.

Wait for all jobs to complete successfully. The complete checks and native builds
take time; there is no fixed completion time. If a job fails, open its failed step
and inspect the log. Do not use unverified candidate tags for deployments.

## 3. Make the packages public once

The first push can create private GHCR packages. If only
**Require downloads without registry credentials** fails with an access error:

1. Open [the repository](https://github.com/sapientorius/Nebulynk) and find
   **Packages**, or open your GitHub profile's **Packages** tab.
2. Open each of `nebulynk-backend`, `nebulynk-frontend` and
   `nebulynk-transcription-worker`.
3. Open **Package settings** and change **Package visibility** to **Public**.
   Follow GitHub's confirmation dialog for each package. Visibility applies to
   the whole package, including its staging tags.
4. Return to the failed workflow run and select **Re-run failed jobs**.
   Matching image tags are reused and the anonymous-download check runs again.

If publishing itself fails with an existing-package permission error, verify that
the Nebulynk repository has **Write** access under the package's **Manage Actions
access** section. Connectivity errors require restoring registry access before
rerunning. Never delete or overwrite an existing tag to fix a conflict.

GitHub documents [package visibility and Actions access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## 4. Read the build result

After the run is successful, open its **Summary**. The publication job's summary
contains all three image references, their digests and a line such as:

```dotenv
NEBULYNK_VERSION=staging-a1b2c3d4e5f6-123456
```

Copy the actual value from your run. The example above is not an existing image.
Download the **container-staging-manifest** artifact for `staging-images.json`,
which records the package version, complete commit, staging tag, platforms and
image digests. Candidate diagnostics are available in the architecture artifacts.

## 5. Deploy to a Coolify test resource

Use a test resource with separate domains, database, Garage volumes and secrets.
A separate server avoids collisions with an existing stack's LiveKit host ports
`7881/tcp` and `7882/udp`; on the same server those mappings must be adjusted.

1. Add the Nebulynk repository as a Git-based **Docker Compose** application.
2. Select the branch used by the successful build, **Base Directory** `/` and
   **Docker Compose Location** `/docker-compose.coolify.yml`.
3. Follow [the Coolify guide](COOLIFY.md) for the four public domain fields and
   generated secrets. For staging, select the test branch and staging tag instead
   of the production guide's stable branch/version.
4. Set `NEBULYNK_VERSION` to the exact staging tag from the successful run.
5. Save, reload the Compose configuration and deploy.
6. Check service health and logs, then test setup/login, chat and Socket.IO,
   uploads/downloads, meetings, recording and transcription if configured.

Use `/docker-compose.coolify.yml` to exercise registry image downloads.
`/docker-compose.coolify.source.yml` builds on Coolify instead and tests the
separate source-deployment path. Branch selection chooses deployment files;
`NEBULYNK_VERSION` chooses the application images.

## 6. Test an update and runtime URL change

1. Create test accounts, a chat message and an uploaded file in the test instance.
2. Trigger another staging workflow, wait for success and copy its new tag.
3. Change only `NEBULYNK_VERSION` in the existing Coolify test resource and
   redeploy. Keep its resource identity, volumes, domains and secrets.
4. Verify that existing accounts, messages and files remain usable and the new
   commit is shown in build information. Allow the backend maintenance window
   described in [the Coolify guide](COOLIFY.md#backend-lifecycle-and-instance-count).
5. To test frontend configuration, route an additional test API domain to the
   same backend, set frontend `API_URL` to that domain and redeploy with the
   same image tag. Verify the browser API and socket connections through that
   domain. Check backend CORS and domain/cookie configuration as applicable.

This validates image publication, download, install, update and runtime frontend
configuration. Real Plesk upgrades and the stable signed-feed rollout retain their
separate release acceptance checks in [the release guide](RELEASING.md).
