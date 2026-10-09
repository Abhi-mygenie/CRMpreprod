import React, { useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IoAddOutline,
  IoTrashOutline,
  IoCreateOutline,
  IoCloseOutline,
  IoSaveOutline,
  IoReorderThreeOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCloudUploadOutline,
  IoDocumentTextOutline,
  IoMenuOutline,
  IoInformationCircleOutline,
  IoFootstepsOutline,
  IoCallOutline,
  IoChatbubblesOutline,
} from 'react-icons/io5';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Tiptap Toolbar
const EditorToolbar = ({ editor }) => {
  if (!editor) return null;
  return (
    <div className="tiptap-toolbar">
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}>H1</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}>H2</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}>H3</button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'active' : ''}><b>B</b></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'active' : ''}><i>I</i></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'active' : ''}><u>U</u></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'active' : ''}><s>S</s></button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'active' : ''}>&#8226; List</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'active' : ''}>1. List</button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => { const url = window.prompt('Enter URL'); if (url) editor.chain().focus().setLink({ href: url }).run(); }}>Link</button>
      <button type="button" onClick={() => { const url = window.prompt('Enter image URL'); if (url) editor.chain().focus().setImage({ src: url }).run(); }}>Image</button>
    </div>
  );
};

// Tiptap Rich Text Editor component
const RichEditor = ({ content, onChange, placeholder }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      TextStyle,
      Color,
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'tiptap-editor', 'data-placeholder': placeholder || '' },
    },
  });
  return (
    <div className="tiptap-wrapper">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

// Sortable Nav Item
const SortableNavItem = ({ item, onToggleVisible }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="nav-sortable-item" data-testid={`nav-item-${item.id}`}>
      <div className="nav-item-drag" {...attributes} {...listeners}>
        <IoReorderThreeOutline />
      </div>
      <span className="nav-item-label">{item.label}</span>
      <span className="nav-item-type">{item.type === 'builtin' ? 'Built-in' : 'Custom Page'}</span>
      <button
        className={`nav-visibility-btn ${item.visible ? 'visible' : 'hidden'}`}
        onClick={() => onToggleVisible(item.id)}
        data-testid={`nav-toggle-${item.id}`}
      >
        {item.visible ? <IoEyeOutline /> : <IoEyeOffOutline />}
      </button>
    </div>
  );
};

const ContentTab = ({ config, setConfig, token, uploadImage, ToggleRow, handleChange }) => {
  const [activeSubTab, setActiveSubTab] = useState('aboutUs');
  const [editingPage, setEditingPage] = useState(null);
  const [newPage, setNewPage] = useState({ title: '', slug: '', content: '', published: false });
  const [uploadingAboutImg, setUploadingAboutImg] = useState(false);
  const aboutImgRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const subTabs = [
    { id: 'aboutUs', label: 'About Us', icon: IoInformationCircleOutline },
    { id: 'contact', label: 'Contact', icon: IoCallOutline },
    { id: 'footer', label: 'Footer', icon: IoFootstepsOutline },
    { id: 'feedback', label: 'Feedback', icon: IoChatbubblesOutline },
    { id: 'extrainfo', label: 'Extra Info', icon: IoInformationCircleOutline },
    { id: 'pages', label: 'Custom Pages', icon: IoDocumentTextOutline },
    { id: 'navigation', label: 'Navigation', icon: IoMenuOutline },
  ];

  const generateSlug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // ---- Custom Pages CRUD ----
  const savePage = async () => {
    if (!newPage.title || !newPage.content) {
      toast.error('Title and content are required');
      return;
    }
    const slug = newPage.slug || generateSlug(newPage.title);
    try {
      if (editingPage) {
        const res = await fetch(`${API_URL}/api/config/pages/${editingPage}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...newPage, slug }),
        });
        if (!res.ok) throw new Error();
        setConfig((prev) => ({
          ...prev,
          customPages: (prev.customPages || []).map((p) => (p.id === editingPage ? { ...p, ...newPage, slug } : p)),
        }));
        toast.success('Page updated');
      } else {
        const res = await fetch(`${API_URL}/api/config/pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...newPage, slug }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConfig((prev) => ({ ...prev, customPages: [...(prev.customPages || []), data.page] }));
        setConfig((prev) => ({
          ...prev,
          navMenuOrder: [...(prev.navMenuOrder || []), { id: data.page.id, label: newPage.title, type: 'custom', visible: true }],
        }));
        toast.success('Page created');
      }
      setEditingPage(null);
      setNewPage({ title: '', slug: '', content: '', published: false });
    } catch {
      toast.error('Failed to save page');
    }
  };

  const deletePage = async (pageId) => {
    try {
      const res = await fetch(`${API_URL}/api/config/pages/${pageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setConfig((prev) => ({
        ...prev,
        customPages: (prev.customPages || []).filter((p) => p.id !== pageId),
        navMenuOrder: (prev.navMenuOrder || []).filter((n) => n.id !== pageId),
      }));
      toast.success('Page deleted');
    } catch {
      toast.error('Failed to delete page');
    }
  };

  const startEditPage = (page) => {
    setEditingPage(page.id);
    setNewPage({ title: page.title, slug: page.slug, content: page.content, published: page.published });
  };

  // ---- Nav Reorder ----
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const items = config.navMenuOrder || [];
      const oldIdx = items.findIndex((i) => i.id === active.id);
      const newIdx = items.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(items, oldIdx, newIdx);
      setConfig((prev) => ({ ...prev, navMenuOrder: reordered }));
    }
  };

  const toggleNavVisible = (id) => {
    setConfig((prev) => ({
      ...prev,
      navMenuOrder: (prev.navMenuOrder || []).map((n) => (n.id === id ? { ...n, visible: !n.visible } : n)),
    }));
  };

  const navItems = config.navMenuOrder || [
    { id: 'home', label: 'Home', type: 'builtin', visible: true },
    { id: 'menu', label: 'Menu', type: 'builtin', visible: true },
    { id: 'about', label: 'About Us', type: 'builtin', visible: true },
  ];

  return (
    <div className="settings-section" data-testid="section-content">
      {/* Sub-tabs */}
      <div className="content-sub-tabs">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`content-sub-tab ${activeSubTab === id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(id)}
            data-testid={`content-tab-${id}`}
          >
            <Icon className="tab-icon" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* About Us */}
      {activeSubTab === 'aboutUs' && (
        <div className="content-panel" data-testid="panel-aboutUs">
          <h3 className="section-title">About Us Content</h3>
          <p className="section-description">Manage your restaurant's About Us page content</p>

          <div className="form-group">
            <label className="form-label">About Us Image</label>
            <div className="image-upload-field">
              <div className="image-url-row">
                <input type="url" className="form-input" placeholder="https://example.com/about.jpg" value={config.aboutUsImage || ''} onChange={(e) => setConfig((p) => ({ ...p, aboutUsImage: e.target.value }))} data-testid="input-aboutUsImage" />
                <input type="file" ref={aboutImgRef} accept="image/*" style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file, setUploadingAboutImg);
                    if (url) setConfig((p) => ({ ...p, aboutUsImage: url }));
                    e.target.value = '';
                  }}
                />
                <button className="upload-btn" onClick={() => aboutImgRef.current?.click()} disabled={uploadingAboutImg} data-testid="upload-aboutUs-img-btn">
                  <IoCloudUploadOutline /> {uploadingAboutImg ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              {config.aboutUsImage && (
                <div className="image-preview-box">
                  <img src={config.aboutUsImage} alt="About preview" className="image-preview-img banner-preview-large" onError={(e) => (e.target.style.display = 'none')} />
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">About Us Content</label>
            <RichEditor content={config.aboutUsContent || ''} onChange={(v) => setConfig((p) => ({ ...p, aboutUsContent: v }))} placeholder="Tell your restaurant's story..." />
          </div>

          <div className="form-group">
            <label className="form-label">Opening Hours</label>
            <RichEditor content={config.openingHours || ''} onChange={(v) => setConfig((p) => ({ ...p, openingHours: v }))} placeholder="Mon-Fri: 10am - 10pm..." />
          </div>
        </div>
      )}

      {/* Footer */}
      {activeSubTab === 'footer' && (
        <div className="content-panel" data-testid="panel-footer">
          <h3 className="section-title">Footer</h3>
          <p className="section-description">Customize the footer section</p>

          <div className="form-group">
            <label className="form-label">Footer Text</label>
            <textarea className="form-input form-textarea" rows={3} placeholder="2026 Your Restaurant. All rights reserved." value={config.footerText || ''} onChange={(e) => setConfig((p) => ({ ...p, footerText: e.target.value }))} data-testid="input-footerText" />
          </div>

          <div className="form-group">
            <label className="form-label">Footer Links</label>
            <div className="footer-links-list">
              {(config.footerLinks || []).map((link, idx) => (
                <div key={idx} className="footer-link-row" data-testid={`footer-link-${idx}`}>
                  <input type="text" className="form-input" placeholder="Label" value={link.label || ''} onChange={(e) => { const updated = [...(config.footerLinks || [])]; updated[idx] = { ...updated[idx], label: e.target.value }; setConfig((p) => ({ ...p, footerLinks: updated })); }} />
                  <input type="url" className="form-input" placeholder="https://..." value={link.url || ''} onChange={(e) => { const updated = [...(config.footerLinks || [])]; updated[idx] = { ...updated[idx], url: e.target.value }; setConfig((p) => ({ ...p, footerLinks: updated })); }} />
                  <button className="banner-delete-btn" onClick={() => { const updated = (config.footerLinks || []).filter((_, i) => i !== idx); setConfig((p) => ({ ...p, footerLinks: updated })); }}>
                    <IoTrashOutline />
                  </button>
                </div>
              ))}
              <button className="add-link-btn" onClick={() => setConfig((p) => ({ ...p, footerLinks: [...(p.footerLinks || []), { label: '', url: '' }] }))} data-testid="add-footer-link-btn">
                <IoAddOutline /> Add Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Info */}
      {activeSubTab === 'contact' && (
        <div className="content-panel" data-testid="panel-contact">
          <h3 className="section-title">Contact Information</h3>
          <p className="section-description">Manage your restaurant's contact details shown on the Contact page</p>

          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-input form-textarea" rows={2} placeholder="123 Food Street, Gourmet City, GC 12345" value={config.address || ''} onChange={(e) => setConfig((p) => ({ ...p, address: e.target.value }))} data-testid="input-address" />
          </div>

          <div className="form-group">
            <label className="form-label">Contact Email</label>
            <input type="email" className="form-input" placeholder="hello@restaurant.com" value={config.contactEmail || ''} onChange={(e) => setConfig((p) => ({ ...p, contactEmail: e.target.value }))} data-testid="input-contactEmail" />
            <span className="form-hint">Public email shown on the Contact page (different from your admin login)</span>
          </div>

          <div className="form-group">
            <label className="form-label">Google Maps Embed URL</label>
            <input type="url" className="form-input" placeholder="https://www.google.com/maps/embed?pb=..." value={config.mapEmbedUrl || ''} onChange={(e) => setConfig((p) => ({ ...p, mapEmbedUrl: e.target.value }))} data-testid="input-mapEmbedUrl" />
            <span className="form-hint">Paste the embed URL from Google Maps (Share &gt; Embed a map)</span>
          </div>
        </div>
      )}

      {/* Feedback Settings */}
      {activeSubTab === 'feedback' && (
        <div className="content-panel" data-testid="panel-feedback">
          <h3 className="section-title">Feedback Page</h3>
          <p className="section-description">Configure the customer feedback form</p>

          <div className="form-group">
            <label className="toggle-row">
              <span className="toggle-label">Enable Feedback Page</span>
              <button className={`toggle-switch ${config.feedbackEnabled ? 'active' : ''}`} onClick={() => setConfig((p) => ({ ...p, feedbackEnabled: !p.feedbackEnabled }))} data-testid="toggle-feedbackEnabled">
                <span className="toggle-knob" />
              </button>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Intro Text</label>
            <textarea className="form-input form-textarea" rows={3} placeholder="We value your opinion! Share your dining experience..." value={config.feedbackIntroText || ''} onChange={(e) => setConfig((p) => ({ ...p, feedbackIntroText: e.target.value }))} data-testid="input-feedbackIntroText" />
          </div>
        </div>
      )}

      {/* Custom Pages */}
      {activeSubTab === 'pages' && (
        <div className="content-panel" data-testid="panel-pages">
          <h3 className="section-title">Custom Pages</h3>
          <p className="section-description">Create and manage additional pages for your site</p>

          <div className="pages-list">
            {(config.customPages || []).map((page) => (
              <div key={page.id} className={`page-card ${editingPage === page.id ? 'editing' : ''}`} data-testid={`page-${page.id}`}>
                <div className="page-card-info">
                  <span className="page-title">{page.title}</span>
                  <span className="page-slug">/{page.slug}</span>
                  <span className={`banner-status ${page.published ? 'active' : 'inactive'}`}>
                    {page.published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="banner-actions">
                  <button className="banner-edit-btn" onClick={() => startEditPage(page)} data-testid={`edit-page-${page.id}`}>
                    <IoCreateOutline />
                  </button>
                  <button className="banner-delete-btn" onClick={() => deletePage(page.id)} data-testid={`delete-page-${page.id}`}>
                    <IoTrashOutline />
                  </button>
                </div>
              </div>
            ))}
            {(config.customPages || []).length === 0 && (
              <p className="empty-state">No custom pages yet. Create one below.</p>
            )}
          </div>

          <div className="add-banner-form">
            <div className="form-subtitle-row">
              <h4 className="form-subtitle">{editingPage ? 'Edit Page' : 'New Page'}</h4>
              {editingPage && (
                <button className="cancel-edit-btn" onClick={() => { setEditingPage(null); setNewPage({ title: '', slug: '', content: '', published: false }); }} data-testid="cancel-edit-page-btn">
                  <IoCloseOutline /> Cancel
                </button>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input type="text" className="form-input" placeholder="Page title" value={newPage.title} onChange={(e) => setNewPage((p) => ({ ...p, title: e.target.value, slug: p.slug || generateSlug(e.target.value) }))} data-testid="input-pageTitle" />
              </div>
              <div className="form-group">
                <label className="form-label">URL Slug</label>
                <input type="text" className="form-input" placeholder="page-slug" value={newPage.slug} onChange={(e) => setNewPage((p) => ({ ...p, slug: e.target.value }))} data-testid="input-pageSlug" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Content *</label>
              <RichEditor content={newPage.content} onChange={(v) => setNewPage((p) => ({ ...p, content: v }))} placeholder="Write page content..." />
            </div>

            <div className="form-group">
              <label className="toggle-row">
                <span className="toggle-label">Published</span>
                <button className={`toggle-switch ${newPage.published ? 'active' : ''}`} onClick={() => setNewPage((p) => ({ ...p, published: !p.published }))} data-testid="toggle-pagePublished">
                  <span className="toggle-knob" />
                </button>
              </label>
            </div>

            <button className={`add-banner-btn ${editingPage ? 'update-mode' : ''}`} onClick={savePage} data-testid={editingPage ? 'update-page-btn' : 'create-page-btn'}>
              {editingPage ? <><IoSaveOutline /> Update Page</> : <><IoAddOutline /> Create Page</>}
            </button>
          </div>
        </div>
      )}

      {/* Navigation Menu Manager */}
      {/* Extra Info */}
      {activeSubTab === 'extrainfo' && (
        <div className="content-panel" data-testid="panel-extrainfo">
          <h3 className="section-title">Extra Info (Menu Footer)</h3>
          <p className="section-description">Configure the extra information section shown at the bottom of the menu</p>

          {ToggleRow && (
            <div className="toggle-list">
              <ToggleRow field="showExtraInfo" label="Show Extra Info Section" />
            </div>
          )}

          {config.showExtraInfo && (
            <div className="form-subsection" style={{ marginTop: '1.5rem' }}>
              <h4 className="form-subsection-title">Info Points (up to 5)</h4>
              <p className="form-hint" style={{ marginBottom: '1rem' }}>
                Leave empty to use defaults: "All prices are exclusive of Govt.Tax/GST" and "A single pour is 30ml of alcohol"
              </p>
              {[0, 1, 2, 3, 4].map((index) => (
                <div className="form-group" key={index} style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={`Info point ${index + 1}`}
                    value={config.extraInfoItems?.[index] || ''}
                    onChange={(e) => {
                      const newItems = [...(config.extraInfoItems || ['', '', '', '', ''])];
                      newItems[index] = e.target.value;
                      if (handleChange) handleChange('extraInfoItems', newItems);
                    }}
                    data-testid={`input-extrainfo-${index}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'navigation' && (
        <div className="content-panel" data-testid="panel-navigation">
          <h3 className="section-title">Navigation Menu</h3>
          <p className="section-description">Drag to reorder and toggle visibility of menu items</p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={navItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="nav-sortable-list" data-testid="nav-menu-list">
                {navItems.map((item) => (
                  <SortableNavItem key={item.id} item={item} onToggleVisible={toggleNavVisible} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <span className="form-hint">Changes are saved when you click "Save Settings" at the top.</span>
        </div>
      )}
    </div>
  );
};

export default ContentTab;
