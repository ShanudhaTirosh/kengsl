// ============================================================
//  KenGSL Admin Panel — Auth, CRUD, Image Compression
// ============================================================

let currentEditId = null;
let currentEditType = null; // 'portfolio' or 'testimonial'
let currentImageBase64 = null;
let portfolioItems = [];
let testimonialItems = [];
let isPrimaryAdmin = false;
let adminUsers = [];

// ===== AUTH =====
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
        showToast(err.message, 'error');
    });
}

function signOutUser() {
    auth.signOut();
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const adminDoc = await db.collection('settings').doc('admin').get();
            if (!adminDoc.exists) {
                // First user — auto-register as primary admin
                await db.collection('settings').doc('admin').set({
                    uid: user.uid,
                    email: user.email,
                    registrationLocked: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                isPrimaryAdmin = true;
                showDashboard(user);
                showToast('Admin account created! You are the primary administrator.', 'success');
            } else if (adminDoc.data().uid === user.uid) {
                // Primary admin
                isPrimaryAdmin = true;
                showDashboard(user);
            } else {
                // Check if granted admin
                const grantedDoc = await db.collection('admins').doc(user.uid).get();
                if (grantedDoc.exists) {
                    isPrimaryAdmin = false;
                    showDashboard(user);
                } else {
                    // Save as pending user so primary admin can see them
                    await db.collection('pendingUsers').doc(user.uid).set({
                        uid: user.uid,
                        email: user.email,
                        photoURL: user.photoURL || '',
                        displayName: user.displayName || '',
                        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    showAccessDenied();
                }
            }
        } catch (err) {
            showToast('Error checking admin access: ' + err.message, 'error');
            showLogin();
        }
    } else {
        showLogin();
    }
});

// ===== UI STATE MANAGEMENT =====
function showLogin() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'none';
}

function showDashboard(user) {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('accessDenied').style.display = 'none';

    const emailEl = document.getElementById('adminEmail');
    const avatarEl = document.getElementById('adminAvatar');
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;

    // Show/hide Users tab (only for primary admin)
    const usersTab = document.querySelector('[data-tab="users"]');
    if (usersTab) usersTab.style.display = isPrimaryAdmin ? '' : 'none';

    loadPortfolioItems();
    loadTestimonials();
    if (isPrimaryAdmin) loadAdminUsers();
}

function showAccessDenied() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'flex';
}

// ===== TAB MANAGEMENT =====
function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`[data-tab="${tab}"]`);
    if (targetTab) targetTab.classList.add('active');

    document.getElementById('portfolioContent').style.display = tab === 'portfolio' ? 'block' : 'none';
    document.getElementById('testimonialsContent').style.display = tab === 'testimonials' ? 'block' : 'none';
    const usersContent = document.getElementById('usersContent');
    if (usersContent) usersContent.style.display = tab === 'users' ? 'block' : 'none';
}

// ===== PORTFOLIO CRUD =====
function loadPortfolioItems() {
    db.collection('portfolio').orderBy('order', 'asc').onSnapshot(snapshot => {
        portfolioItems = [];
        snapshot.forEach(doc => portfolioItems.push({ id: doc.id, ...doc.data() }));
        renderPortfolioGrid(portfolioItems);
        updateStats();
    }, err => {
        showToast('Error loading portfolio: ' + err.message, 'error');
    });
}

function renderPortfolioGrid(items) {
    const grid = document.getElementById('adminPortfolioGrid');
    const countEl = document.getElementById('portfolioCount');
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images"></i>
                <h3>No portfolio items yet</h3>
                <p>Add your first project to get started</p>
            </div>`;
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="admin-card" data-id="${item.id}">
            <div class="admin-card-img">
                <img src="${item.image || 'https://placehold.co/600x400/141419/71717a?text=No+Image'}" 
                     alt="${escapeHTML(item.title)}" loading="lazy"
                     onerror="this.src='https://placehold.co/600x400/141419/71717a?text=Error'">
                <span class="admin-card-badge">${escapeHTML(item.categoryDisplay || item.category)}</span>
            </div>
            <div class="admin-card-body">
                <h3>${escapeHTML(item.title)}</h3>
                <p>${escapeHTML(item.description || '')}</p>
            </div>
            <div class="admin-card-actions">
                <button class="action-btn edit-btn" onclick="openEditPortfolio('${item.id}')" title="Edit">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="action-btn delete-btn" onclick="confirmDelete('${item.id}', 'portfolio')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function savePortfolioItem(e) {
    e.preventDefault();
    const form = document.getElementById('portfolioForm');
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const data = {
        title: form.pTitle.value.trim(),
        category: form.pCategory.value,
        categoryDisplay: form.pCategoryDisplay.value.trim(),
        description: form.pDescription.value.trim(),
        result: form.pResult.value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (currentImageBase64) {
        data.image = currentImageBase64;
    }

    try {
        if (currentEditId) {
            await db.collection('portfolio').doc(currentEditId).update(data);
            showToast('Portfolio item updated!', 'success');
        } else {
            data.order = portfolioItems.length + 1;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            if (!currentImageBase64) {
                showToast('Please upload an image', 'error');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
            await db.collection('portfolio').add(data);
            showToast('Portfolio item added!', 'success');
        }
        closeModal('portfolioModal');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
}

function openAddPortfolio() {
    currentEditId = null;
    currentImageBase64 = null;
    document.getElementById('portfolioModalTitle').textContent = 'Add Portfolio Item';
    document.getElementById('portfolioForm').reset();
    document.getElementById('imagePreviewArea').innerHTML = '';
    document.getElementById('compressionInfo').style.display = 'none';
    openModal('portfolioModal');
}

function openEditPortfolio(id) {
    const item = portfolioItems.find(i => i.id === id);
    if (!item) return;

    currentEditId = id;
    currentImageBase64 = item.image || null;

    document.getElementById('portfolioModalTitle').textContent = 'Edit Portfolio Item';
    const form = document.getElementById('portfolioForm');
    form.pTitle.value = item.title || '';
    form.pCategory.value = item.category || 'thumbnail';
    form.pCategoryDisplay.value = item.categoryDisplay || '';
    form.pDescription.value = item.description || '';
    form.pResult.value = item.result || '';

    const previewArea = document.getElementById('imagePreviewArea');
    if (item.image) {
        previewArea.innerHTML = `<img src="${item.image}" alt="Current image" class="image-preview">`;
    } else {
        previewArea.innerHTML = '';
    }
    document.getElementById('compressionInfo').style.display = 'none';

    openModal('portfolioModal');
}

// ===== TESTIMONIALS CRUD =====
function loadTestimonials() {
    db.collection('testimonials').orderBy('order', 'asc').onSnapshot(snapshot => {
        testimonialItems = [];
        snapshot.forEach(doc => testimonialItems.push({ id: doc.id, ...doc.data() }));
        renderTestimonialsList(testimonialItems);
        updateStats();
    }, err => {
        showToast('Error loading testimonials: ' + err.message, 'error');
    });
}

function renderTestimonialsList(items) {
    const list = document.getElementById('adminTestimonialsList');
    const countEl = document.getElementById('testimonialCount');
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-quote-right"></i>
                <h3>No testimonials yet</h3>
                <p>Add client feedback to showcase</p>
            </div>`;
        return;
    }

    list.innerHTML = items.map(item => `
        <div class="testimonial-row" data-id="${item.id}">
            <div class="testimonial-row-content">
                <div class="testimonial-row-avatar">${escapeHTML((item.authorName || 'A')[0])}</div>
                <div class="testimonial-row-info">
                    <h4>${escapeHTML(item.authorName)}</h4>
                    <p class="testimonial-row-role">${escapeHTML(item.authorRole || '')}</p>
                    <p class="testimonial-row-quote">"${escapeHTML(item.quote)}"</p>
                    <div class="testimonial-row-stars">${'<i class="fas fa-star"></i>'.repeat(item.rating || 5)}</div>
                </div>
            </div>
            <div class="testimonial-row-actions">
                <button class="action-btn edit-btn" onclick="openEditTestimonial('${item.id}')" title="Edit">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="action-btn delete-btn" onclick="confirmDelete('${item.id}', 'testimonial')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function saveTestimonial(e) {
    e.preventDefault();
    const form = document.getElementById('testimonialForm');
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const data = {
        authorName: form.tAuthorName.value.trim(),
        authorRole: form.tAuthorRole.value.trim(),
        quote: form.tQuote.value.trim(),
        rating: parseInt(form.tRating.value) || 5,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (currentEditId) {
            await db.collection('testimonials').doc(currentEditId).update(data);
            showToast('Testimonial updated!', 'success');
        } else {
            data.order = testimonialItems.length + 1;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('testimonials').add(data);
            showToast('Testimonial added!', 'success');
        }
        closeModal('testimonialModal');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
}

function openAddTestimonial() {
    currentEditId = null;
    document.getElementById('testimonialModalTitle').textContent = 'Add Testimonial';
    document.getElementById('testimonialForm').reset();
    openModal('testimonialModal');
}

function openEditTestimonial(id) {
    const item = testimonialItems.find(i => i.id === id);
    if (!item) return;
    currentEditId = id;

    document.getElementById('testimonialModalTitle').textContent = 'Edit Testimonial';
    const form = document.getElementById('testimonialForm');
    form.tAuthorName.value = item.authorName || '';
    form.tAuthorRole.value = item.authorRole || '';
    form.tQuote.value = item.quote || '';
    form.tRating.value = item.rating || 5;

    openModal('testimonialModal');
}

// ===== DELETE =====
function confirmDelete(id, type) {
    currentEditId = id;
    currentEditType = type;
    openModal('deleteModal');
}

async function executeDelete() {
    if (!currentEditId || !currentEditType) return;
    const btn = document.querySelector('#deleteModal .btn-danger');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    btn.disabled = true;

    try {
        const collection = currentEditType === 'portfolio' ? 'portfolio' : 'testimonials';
        await db.collection(collection).doc(currentEditId).delete();
        showToast(`${currentEditType === 'portfolio' ? 'Portfolio item' : 'Testimonial'} deleted!`, 'success');
        closeModal('deleteModal');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }

    btn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    btn.disabled = false;
    currentEditId = null;
    currentEditType = null;
}

// ===== IMAGE COMPRESSION (WebP) =====
async function compressToWebP(file, quality = 0.75, maxWidth = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;

            if (w > maxWidth) {
                h = Math.round((maxWidth / w) * h);
                w = maxWidth;
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            // Try WebP first, fallback to JPEG
            const format = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';

            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('Compression failed')); return; }
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        base64: reader.result,
                        originalSize: file.size,
                        compressedSize: blob.size,
                        format: format === 'image/webp' ? 'WebP' : 'JPEG',
                        width: w,
                        height: h
                    });
                };
                reader.readAsDataURL(blob);
            }, format, quality);

            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    const qualitySlider = document.getElementById('qualitySlider');
    const quality = parseFloat(qualitySlider.value);
    const previewArea = document.getElementById('imagePreviewArea');
    const compressionInfo = document.getElementById('compressionInfo');

    previewArea.innerHTML = '<div class="compress-loading"><i class="fas fa-spinner fa-spin"></i> Compressing...</div>';
    compressionInfo.style.display = 'none';

    try {
        const result = await compressToWebP(file, quality);

        // Check if compressed size is too large for Firestore (keep under 900KB)
        if (result.compressedSize > 900000) {
            // Re-compress with lower quality
            const lowerResult = await compressToWebP(file, 0.5, 1000);
            if (lowerResult.compressedSize > 900000) {
                showToast('Image too large even after compression. Use a smaller image.', 'error');
                previewArea.innerHTML = '';
                return;
            }
            Object.assign(result, lowerResult);
        }

        currentImageBase64 = result.base64;
        previewArea.innerHTML = `<img src="${result.base64}" alt="Preview" class="image-preview">`;

        compressionInfo.style.display = 'flex';
        document.getElementById('originalSize').textContent = formatBytes(result.originalSize);
        document.getElementById('compressedSize').textContent = formatBytes(result.compressedSize);
        document.getElementById('compressionFormat').textContent = result.format;
        const savings = Math.round((1 - result.compressedSize / result.originalSize) * 100);
        document.getElementById('compressionSavings').textContent = savings + '% smaller';

    } catch (err) {
        showToast('Compression error: ' + err.message, 'error');
        previewArea.innerHTML = '';
    }
}

async function recompressImage() {
    const input = document.getElementById('imageInput');
    if (input.files[0]) {
        await handleImageUpload(input);
    }
}

// ===== MODAL MANAGEMENT =====
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (id === 'portfolioModal') {
        currentEditId = null;
        currentImageBase64 = null;
    }
    if (id === 'testimonialModal') {
        currentEditId = null;
    }
}

// ===== STATS =====
function updateStats() {
    const totalEl = document.getElementById('statTotal');
    const thumbEl = document.getElementById('statThumbnails');
    const promoEl = document.getElementById('statPromo');
    const testiEl = document.getElementById('statTestimonials');

    if (totalEl) totalEl.textContent = portfolioItems.length;
    if (thumbEl) thumbEl.textContent = portfolioItems.filter(i => i.category === 'thumbnail').length;
    if (promoEl) promoEl.textContent = portfolioItems.filter(i => i.category === 'promotion' || i.category === 'social').length;
    if (testiEl) testiEl.textContent = testimonialItems.length;
}

// ===== UTILITIES =====
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== DRAG & DROP for image upload =====
function initDragDrop() {
    const dropZone = document.getElementById('uploadDropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) {
            const input = document.getElementById('imageInput');
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            handleImageUpload(input);
        }
    });
}

// ===== USER MANAGEMENT (Primary Admin Only) =====
function loadAdminUsers() {
    // Load granted admins
    db.collection('admins').onSnapshot(snapshot => {
        adminUsers = [];
        snapshot.forEach(doc => adminUsers.push({ id: doc.id, ...doc.data() }));
        renderUsersList();
    });

    // Load pending users
    db.collection('pendingUsers').onSnapshot(snapshot => {
        const pending = [];
        snapshot.forEach(doc => pending.push({ id: doc.id, ...doc.data() }));
        renderPendingUsers(pending);
    });
}

function renderUsersList() {
    const list = document.getElementById('grantedAdminsList');
    if (!list) return;

    if (adminUsers.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No additional admins granted yet.</p>';
        return;
    }

    list.innerHTML = adminUsers.map(u => `
        <div class="testimonial-row">
            <div class="testimonial-row-content">
                <div class="testimonial-row-avatar" style="background:linear-gradient(135deg,#10b981,#059669)">${(u.email || 'A')[0].toUpperCase()}</div>
                <div class="testimonial-row-info">
                    <h4>${escapeHTML(u.displayName || u.email)}</h4>
                    <p class="testimonial-row-role">${escapeHTML(u.email)}</p>
                    <p class="testimonial-row-role" style="color:#10b981"><i class="fas fa-check-circle"></i> Admin access granted</p>
                </div>
            </div>
            <div class="testimonial-row-actions">
                <button class="action-btn delete-btn" onclick="revokeAdmin('${u.id}','${escapeHTML(u.email)}')" title="Revoke Access">
                    <i class="fas fa-user-slash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderPendingUsers(pending) {
    const list = document.getElementById('pendingUsersList');
    if (!list) return;
    const countEl = document.getElementById('pendingCount');
    if (countEl) countEl.textContent = pending.length;

    if (pending.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No pending access requests.</p>';
        return;
    }

    list.innerHTML = pending.map(u => `
        <div class="testimonial-row">
            <div class="testimonial-row-content">
                <div class="testimonial-row-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706)">${(u.email || 'A')[0].toUpperCase()}</div>
                <div class="testimonial-row-info">
                    <h4>${escapeHTML(u.displayName || 'Unknown')}</h4>
                    <p class="testimonial-row-role">${escapeHTML(u.email)}</p>
                    <p class="testimonial-row-role" style="color:#f59e0b"><i class="fas fa-clock"></i> Pending access</p>
                </div>
            </div>
            <div class="testimonial-row-actions">
                <button class="action-btn edit-btn" onclick="grantAdmin('${u.id}','${escapeHTML(u.email)}','${escapeHTML(u.displayName || '')}')" title="Grant Access" style="border-color:#10b981;color:#10b981">
                    <i class="fas fa-user-check"></i>
                </button>
                <button class="action-btn delete-btn" onclick="removePending('${u.id}')" title="Reject">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function grantAdmin(uid, email, displayName) {
    try {
        await db.collection('admins').doc(uid).set({
            uid: uid,
            email: email,
            displayName: displayName,
            grantedBy: auth.currentUser.email,
            grantedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Remove from pending
        await db.collection('pendingUsers').doc(uid).delete();
        showToast('Admin access granted to ' + email, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function revokeAdmin(uid, email) {
    if (!confirm('Revoke admin access for ' + email + '?')) return;
    try {
        await db.collection('admins').doc(uid).delete();
        showToast('Admin access revoked for ' + email, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function removePending(uid) {
    try {
        await db.collection('pendingUsers').doc(uid).delete();
        showToast('Pending user removed', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function searchAndGrantByEmail() {
    const input = document.getElementById('grantEmailInput');
    const email = input.value.trim().toLowerCase();
    if (!email) { showToast('Enter an email address', 'error'); return; }

    // Search in pending users by email
    try {
        const snapshot = await db.collection('pendingUsers').where('email', '==', email).get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            await grantAdmin(doc.id, data.email, data.displayName || '');
            input.value = '';
        } else {
            showToast('No pending user found with that email. They need to sign in first on the admin page.', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initDragDrop();

    // Close modals on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    // Close modals on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
        }
    });
});
