import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';

type Bindings = {
  DEVDROP_PASSWORD?: string;
  JWT_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Configure API Key (Firestore API Key)
const FIRESTORE_API_KEY = "AIzaSyAiO44kikucTKZgRSzoEv-NM2WNqAXBkGk";
const FIRESTORE_PROJECT_ID = "codeshare-3e48f";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;

// Helper for Session signing
const DEFAULT_JWT_SECRET = "devdrop_default_jwt_secret_change_me_in_production";

async function getCryptoKey(secret: string, mode: 'sign' | 'verify') {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [mode === 'sign' ? 'sign' : 'verify']
  );
}

async function signSession(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await getCryptoKey(secret, 'sign');
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(payload)
  );
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${hashHex}`;
}

async function verifySession(signedData: string, secret: string): Promise<boolean> {
  const parts = signedData.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expectedSigned = await signSession(payload, secret);
  return expectedSigned === signedData;
}

// Helpers for Firestore REST API
function mapFirestoreDoc(doc: any) {
  const fields = doc.fields || {};
  const result: any = {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in (value as any)) result[key] = (value as any).stringValue;
    else if ('integerValue' in (value as any)) result[key] = parseInt((value as any).integerValue, 10);
    else if ('doubleValue' in (value as any)) result[key] = parseFloat((value as any).doubleValue);
    else if ('booleanValue' in (value as any)) result[key] = (value as any).booleanValue;
  }
  if (!result.id && doc.name) {
    const parts = doc.name.split('/');
    result.id = parts[parts.length - 1];
  }
  return result;
}

function toFirestoreFields(obj: any) {
  const fields: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value.toString() };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    }
  }
  return { fields };
}

// Firestore operations
async function updateWorkspaceTimestamp() {
  const url = `${FIRESTORE_BASE_URL}/workspace/default?key=${FIRESTORE_API_KEY}`;
  const now = new Date().toISOString();
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toFirestoreFields({ updatedAt: now }))
  });
}

// Enable CORS (Required only for cross-port dev proxy)
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return 'https://devdrop.harshtiwari.dev';
    if (
      origin.startsWith('http://localhost:') ||
      origin.endsWith('.harshtiwari.dev') ||
      origin === 'https://devdrop.harshtiwari.dev'
    ) {
      return origin;
    }
    return 'https://devdrop.harshtiwari.dev';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

// Session Authentication Middleware
async function authMiddleware(c: any, next: any) {
  const cookies = c.req.header('Cookie') || '';
  const match = cookies.match(/devdrop_session=([^;]+)/);
  const sessionVal = match ? decodeURIComponent(match[1]) : null;
  const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;

  if (!sessionVal) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const isValid = await verifySession(sessionVal, secret);
  if (!isValid) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Parse payload to check expiry
  try {
    const payloadStr = atob(sessionVal.split('.')[0]);
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiry) {
      return c.json({ error: 'Session expired' }, 401);
    }
  } catch (e) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
}

// Protect all API routes except login and logout
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/login' || c.req.path === '/api/logout') {
    await next();
    return;
  }
  return authMiddleware(c, next);
});

// Routes

// 1. POST /login
app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const password = body.password;
  const actualPassword = c.env.DEVDROP_PASSWORD || "harsh@78"; // Fallback to prompt password for easy testing

  if (password !== actualPassword) {
    // Add rate limiting delay in case of brute force
    await new Promise(resolve => setTimeout(resolve, 500));
    return c.json({ error: 'Invalid password' }, 401);
  }

  const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days session
  const payload = btoa(JSON.stringify({ authenticated: true, expiry }));
  const signedCookie = await signSession(payload, secret);

  // Set HTTP-Only Secure cookie
  const isProd = c.req.url.startsWith('https://');
  const cookieOptions = [
    `devdrop_session=${encodeURIComponent(signedCookie)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];
  if (isProd) {
    cookieOptions.push('Secure');
  }

  c.header('Set-Cookie', cookieOptions.join('; '));
  return c.json({ success: true });
});

// 2. POST /logout
app.post('/api/logout', (c) => {
  c.header('Set-Cookie', 'devdrop_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return c.json({ success: true });
});

// 3. GET /workspace/status
app.get('/api/workspace/status', async (c) => {
  const url = `${FIRESTORE_BASE_URL}/workspace/default?key=${FIRESTORE_API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return c.json({ updatedAt: new Date(0).toISOString() });
    }
    const data: any = await res.json();
    const mapped = mapFirestoreDoc(data);
    return c.json({ updatedAt: mapped.updatedAt || new Date(0).toISOString() });
  } catch (e) {
    return c.json({ error: 'Failed to fetch status' }, 500);
  }
});

// 4. GET /workspace
app.get('/api/workspace', async (c) => {
  const filesUrl = `${FIRESTORE_BASE_URL}/workspace/default/files?key=${FIRESTORE_API_KEY}`;
  const metaUrl = `${FIRESTORE_BASE_URL}/workspace/default?key=${FIRESTORE_API_KEY}`;

  try {
    const [filesRes, metaRes] = await Promise.all([
      fetch(filesUrl),
      fetch(metaUrl)
    ]);

    let files: any[] = [];
    if (filesRes.ok) {
      const filesData: any = await filesRes.json();
      if (filesData.documents) {
        files = filesData.documents.map(mapFirestoreDoc);
      }
    }

    let updatedAt = new Date(0).toISOString();
    if (metaRes.ok) {
      const metaData: any = await metaRes.json();
      const mappedMeta = mapFirestoreDoc(metaData);
      updatedAt = mappedMeta.updatedAt || updatedAt;
    }

    // Sort files by order ascending
    files.sort((a, b) => (a.order || 0) - (b.order || 0));

    return c.json({
      files,
      updatedAt
    });
  } catch (e) {
    return c.json({ error: 'Failed to fetch workspace' }, 500);
  }
});

// 5. POST /workspace (Import files in bulk)
app.post('/api/workspace', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const files = body.files;

  if (!Array.isArray(files)) {
    return c.json({ error: 'Invalid files data' }, 400);
  }

  try {
    const promises = files.map(async (file: any) => {
      const fileId = file.id || Math.random().toString(36).substring(2, 15);
      const url = `${FIRESTORE_BASE_URL}/workspace/default/files/${fileId}?key=${FIRESTORE_API_KEY}`;
      
      const payload = {
        id: fileId,
        name: file.name || 'unnamed',
        type: file.type || 'file',
        parentId: file.parentId || '',
        content: file.content || '',
        language: file.language || 'text',
        updatedAt: new Date().toISOString(),
        order: typeof file.order === 'number' ? file.order : 0
      };

      return fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreFields(payload))
      });
    });

    await Promise.all(promises);
    await updateWorkspaceTimestamp();

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to import files' }, 500);
  }
});

// 6. PUT /workspace (Bulk update - e.g. reordering files)
app.put('/api/workspace', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const files = body.files;

  if (!Array.isArray(files)) {
    return c.json({ error: 'Invalid files data' }, 400);
  }

  try {
    const promises = files.map(async (file: any) => {
      const url = `${FIRESTORE_BASE_URL}/workspace/default/files/${file.id}?key=${FIRESTORE_API_KEY}&updateMask.fieldPaths=order&updateMask.fieldPaths=updatedAt`;
      
      const payload = {
        order: file.order,
        updatedAt: new Date().toISOString()
      };

      return fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreFields(payload))
      });
    });

    await Promise.all(promises);
    await updateWorkspaceTimestamp();

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to update workspace orders' }, 500);
  }
});

// 7. DELETE /workspace/:id (Clear workspace - deletes all files)
app.delete('/api/workspace/:id', async (c) => {
  const filesUrl = `${FIRESTORE_BASE_URL}/workspace/default/files?key=${FIRESTORE_API_KEY}`;
  try {
    const res = await fetch(filesUrl);
    if (res.ok) {
      const data: any = await res.json();
      if (data.documents) {
        const deletePromises = data.documents.map(async (doc: any) => {
          const deleteUrl = `https://firestore.googleapis.com/v1/${doc.name}?key=${FIRESTORE_API_KEY}`;
          return fetch(deleteUrl, { method: 'DELETE' });
        });
        await Promise.all(deletePromises);
      }
    }
    await updateWorkspaceTimestamp();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to clear workspace' }, 500);
  }
});

// 8. POST /file
app.post('/api/file', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, content, language, order, type, parentId } = body;

  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const fileId = Math.random().toString(36).substring(2, 15);
  const url = `${FIRESTORE_BASE_URL}/workspace/default/files/${fileId}?key=${FIRESTORE_API_KEY}`;
  
  const payload = {
    id: fileId,
    name: name.trim(),
    type: type === 'folder' ? 'folder' : 'file',
    parentId: parentId || '',
    content: type === 'folder' ? '' : (content || ''),
    language: type === 'folder' ? '' : (language || 'plaintext'),
    updatedAt: new Date().toISOString(),
    order: typeof order === 'number' ? order : 0
  };

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toFirestoreFields(payload))
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: 'Failed to create item in Firestore', details: errText }, 500);
    }

    await updateWorkspaceTimestamp();
    return c.json(payload);
  } catch (e) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 9. PUT /file/:id
app.put('/api/file/:id', async (c) => {
  const fileId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { name, content, language, order, type, parentId } = body;

  const url = `${FIRESTORE_BASE_URL}/workspace/default/files/${fileId}?key=${FIRESTORE_API_KEY}`;
  
  const payload: any = {
    updatedAt: new Date().toISOString()
  };
  if (name !== undefined) payload.name = name.trim();
  if (content !== undefined) payload.content = content;
  if (language !== undefined) payload.language = language;
  if (order !== undefined) payload.order = order;
  if (type !== undefined) payload.type = type;
  if (parentId !== undefined) payload.parentId = parentId || '';

  const maskPaths = Object.keys(payload).map(p => `updateMask.fieldPaths=${p}`).join('&');
  const patchUrl = `${url}&${maskPaths}`;

  try {
    const res = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toFirestoreFields(payload))
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: 'Failed to update item', details: errText }, 500);
    }

    await updateWorkspaceTimestamp();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 10. DELETE /file/:id (deletes files or folders recursively)
app.delete('/api/file/:id', async (c) => {
  const fileId = c.req.param('id');
  const getUrl = `${FIRESTORE_BASE_URL}/workspace/default/files/${fileId}?key=${FIRESTORE_API_KEY}`;

  try {
    const getRes = await fetch(getUrl);
    if (!getRes.ok) {
      return c.json({ success: true }); // Assume already deleted
    }

    const doc = await getRes.json();
    const item = mapFirestoreDoc(doc);

    const deletePromises = [];
    // Delete the root item itself
    deletePromises.push(fetch(getUrl, { method: 'DELETE' }));

    if (item.type === 'folder') {
      // Fetch all files to recursively delete nested descendants
      const filesUrl = `${FIRESTORE_BASE_URL}/workspace/default/files?key=${FIRESTORE_API_KEY}`;
      const filesRes = await fetch(filesUrl);
      if (filesRes.ok) {
        const filesData: any = await filesRes.json();
        if (filesData.documents) {
          const allItems = filesData.documents.map(mapFirestoreDoc);
          
          const descendants: string[] = [];
          function traverse(id: string) {
            const children = allItems.filter(x => x.parentId === id);
            for (const child of children) {
              descendants.push(child.id);
              if (child.type === 'folder') {
                traverse(child.id);
              }
            }
          }
          traverse(fileId);

          for (const descId of descendants) {
            const descDelUrl = `${FIRESTORE_BASE_URL}/workspace/default/files/${descId}?key=${FIRESTORE_API_KEY}`;
            deletePromises.push(fetch(descDelUrl, { method: 'DELETE' }));
          }
        }
      }
    }

    await Promise.all(deletePromises);
    await updateWorkspaceTimestamp();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 11. POST /duplicate/:id (duplicates files or folders recursively)
app.post('/api/duplicate/:id', async (c) => {
  const fileId = c.req.param('id');
  const getUrl = `${FIRESTORE_BASE_URL}/workspace/default/files/${fileId}?key=${FIRESTORE_API_KEY}`;

  try {
    const getRes = await fetch(getUrl);
    if (!getRes.ok) {
      return c.json({ error: 'Item to duplicate not found' }, 404);
    }

    const doc = await getRes.json();
    const rootItem = mapFirestoreDoc(doc);

    const itemsToCreate: any[] = [];
    const idMap: { [oldId: string]: string } = {};

    const newRootId = Math.random().toString(36).substring(2, 15);
    idMap[rootItem.id] = newRootId;

    const name = rootItem.name || 'unnamed';
    const lastDotIndex = name.lastIndexOf('.');
    let newName = '';
    if (rootItem.type === 'file' && lastDotIndex > 0) {
      newName = `${name.substring(0, lastDotIndex)}_copy${name.substring(lastDotIndex)}`;
    } else {
      newName = `${name}_copy`;
    }

    itemsToCreate.push({
      id: newRootId,
      name: newName,
      type: rootItem.type || 'file',
      parentId: rootItem.parentId || '',
      content: rootItem.content || '',
      language: rootItem.language || 'text',
      updatedAt: new Date().toISOString(),
      order: (rootItem.order || 0) + 1
    });

    if (rootItem.type === 'folder') {
      // Fetch all files to recursively clone descendants
      const filesUrl = `${FIRESTORE_BASE_URL}/workspace/default/files?key=${FIRESTORE_API_KEY}`;
      const filesRes = await fetch(filesUrl);
      if (filesRes.ok) {
        const filesData: any = await filesRes.json();
        if (filesData.documents) {
          const allItems = filesData.documents.map(mapFirestoreDoc);

          function traverse(oldParentId: string) {
            const children = allItems.filter(x => x.parentId === oldParentId);
            for (const child of children) {
              const newChildId = Math.random().toString(36).substring(2, 15);
              idMap[child.id] = newChildId;

              itemsToCreate.push({
                id: newChildId,
                name: child.name,
                type: child.type || 'file',
                parentId: child.parentId, // Stored to resolve relative IDs later
                oldParentId: oldParentId, 
                content: child.content || '',
                language: child.language || 'text',
                updatedAt: new Date().toISOString(),
                order: child.order || 0
              });

              if (child.type === 'folder') {
                traverse(child.id);
              }
            }
          }
          traverse(rootItem.id);
        }
      }
    }

    const createPromises = itemsToCreate.map(async (item) => {
      let parentId = item.parentId;
      if (item.oldParentId && idMap[item.oldParentId]) {
        parentId = idMap[item.oldParentId];
      } else if (item.id !== newRootId) {
        parentId = idMap[parentId] || parentId || '';
      }
      
      const { oldParentId: _, ...cleanItem } = item;
      cleanItem.parentId = parentId;

      const postUrl = `${FIRESTORE_BASE_URL}/workspace/default/files/${cleanItem.id}?key=${FIRESTORE_API_KEY}`;
      return fetch(postUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreFields(cleanItem))
      });
    });

    await Promise.all(createPromises);
    await updateWorkspaceTimestamp();

    return c.json(itemsToCreate[0]);
  } catch (e) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export const onRequest = handle(app);
