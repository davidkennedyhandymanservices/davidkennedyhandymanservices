const SETTINGS_KEY = 'david-kennedy-github-settings';
const API_ROOT = 'https://api.github.com';

function getDefaultConnectionSettings() {
    const hostname = window.location.hostname;
    const segments = window.location.pathname.split('/').filter(Boolean);
    const isGitHubPages = hostname.endsWith('.github.io');
    const owner = isGitHubPages ? hostname.slice(0, -'.github.io'.length) : '';
    return {
        owner,
        repository: isGitHubPages && segments[0] !== 'admin' ? (segments[0] || `${owner}.github.io`) : (isGitHubPages ? `${owner}.github.io` : ''),
        branch: 'main',
        token: ''
    };
}

export function readConnectionSettings() {
    const defaults = getDefaultConnectionSettings();
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return defaults;

    const parsed = JSON.parse(saved);
    return {
        owner: typeof parsed.owner === 'string' ? parsed.owner : defaults.owner,
        repository: typeof parsed.repository === 'string' ? parsed.repository : defaults.repository,
        branch: typeof parsed.branch === 'string' && parsed.branch ? parsed.branch : defaults.branch,
        token: typeof parsed.token === 'string' ? parsed.token : ''
    };
}

function repositoryUrl(settings) {
    const owner = encodeURIComponent(settings.owner);
    const repository = encodeURIComponent(settings.repository);
    return `${API_ROOT}/repos/${owner}/${repository}`;
}

function describeApiError(response, details = {}) {
    const message = typeof details.message === 'string' ? details.message : '';
    if (response.status === 401) {
        return new Error('GitHub rejected the token. Check that it is valid and has not expired.');
    }
    if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
        return new Error('GitHub API rate limit reached. Wait a little while, then try again.');
    }
    if (response.status === 429) {
        return new Error('GitHub API rate limit reached. Wait a little while, then try again.');
    }
    if (response.status === 403) {
        return new Error(message || 'GitHub denied access. Check the token’s repository access and Contents: Read and write permission.');
    }
    if (response.status === 404) {
        return new Error('The repository or requested file was not found. Check the owner, repository and branch names.');
    }
    if (response.status === 409 || response.status === 422) {
        return new Error('GitHub could not apply the update because the file changed or the branch rejected the commit. Reload the live content and try again.');
    }
    return new Error(message || `GitHub returned an error (${response.status}).`);
}

async function githubRequest(url, settings, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${settings.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...options.headers
        }
    });

    let result;
    try {
        result = await response.json();
    } catch {
        result = {};
    }
    if (!response.ok) throw describeApiError(response, result);
    return result;
}

export async function testRepositoryConnection(settings) {
    if (!settings.owner || !settings.repository || !settings.branch || !settings.token) {
        throw new Error('Enter the GitHub owner, repository, branch and token.');
    }
    const repository = await githubRequest(repositoryUrl(settings), settings);
    if (repository.permissions?.push !== true) {
        throw new Error('The token can reach this repository, but GitHub did not confirm write access. Grant Contents: Read and write access to this repository.');
    }
    return `Write access confirmed for ${settings.owner}/${settings.repository} on branch ${settings.branch}.`;
}

function base64FromBytes(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

function imagePayload(dataUrl) {
    const match = /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) {
        throw new Error('An uploaded photo is not a compressed WebP or JPEG image. Select the image again and retry.');
    }
    return {
        extension: match[1] === 'image/webp' ? 'webp' : 'jpg',
        content: match[2]
    };
}

function contentFileUrl(settings, filePath) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    return `${repositoryUrl(settings)}/contents/${encodedPath}?ref=${encodeURIComponent(settings.branch)}`;
}

async function existingSha(settings, filePath) {
    const response = await fetch(contentFileUrl(settings, filePath), {
        cache: 'no-store',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${settings.token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (response.status === 404) return undefined;
    let result;
    try {
        result = await response.json();
    } catch {
        result = {};
    }
    if (!response.ok) throw describeApiError(response, result);
    return result.sha;
}

async function putFile(settings, filePath, content, message) {
    const sha = await existingSha(settings, filePath);
    const body = { message, content, branch: settings.branch };
    if (sha) body.sha = sha;
    return githubRequest(contentFileUrl(settings, filePath).split('?')[0], settings, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

export async function publishContent(content, settings, onProgress = () => {}) {
    if (!settings.owner || !settings.repository || !settings.branch || !settings.token) {
        throw new Error('Enter the GitHub owner, repository, branch and token in Connection Settings.');
    }

    const updated = JSON.parse(JSON.stringify(content));
    const images = [];
    if (typeof updated.logo === 'string' && updated.logo.startsWith('data:')) {
        images.push({ field: 'logo', index: -1, dataUrl: updated.logo });
    }
    updated.gallery.forEach((item, index) => {
        if (typeof item.src === 'string' && item.src.startsWith('data:')) {
            images.push({ field: 'gallery', index, dataUrl: item.src });
        }
    });

    for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        onProgress(`Uploading images… (${index + 1} of ${images.length})`);
        const payload = imagePayload(image.dataUrl);
        const filename = image.field === 'logo' ? `logo.${payload.extension}` : `gallery-${image.index + 1}.${payload.extension}`;
        const filePath = `assets/${filename}`;
        await putFile(settings, filePath, payload.content, 'Update website image');
        if (image.field === 'logo') updated.logo = filePath;
        else updated.gallery[image.index].src = filePath;
    }

    onProgress('Updating site-content.json…');
    const jsonBytes = new TextEncoder().encode(`${JSON.stringify(updated, null, 2)}\n`);
    await putFile(settings, 'site-content.json', base64FromBytes(jsonBytes), 'Update website content from admin');
    return updated;
}
