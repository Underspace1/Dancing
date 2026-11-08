using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Windows.Forms.Integration;
using MediaElement = System.Windows.Controls.MediaElement;
using MediaState = System.Windows.Controls.MediaState;
using Json = System.Collections.Generic.Dictionary<string, object>;

static class Program
{
    [STAThread]
    static void Main()
    {
        DancingWindow.LoadFonts();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new DancingWindow());
    }
}

sealed class DancingWindow : Form
{
    static readonly Color Ink = Color.FromArgb(237, 237, 240);
    static readonly Color Base = Color.FromArgb(9, 9, 11);
    static readonly Color Panel = Color.FromArgb(16, 16, 19);
    static readonly Color Raised = Color.FromArgb(22, 22, 26);
    static readonly Color Line = Color.FromArgb(43, 43, 51);
    static readonly Color Muted = Color.FromArgb(156, 156, 168);
    static readonly Color Accent = Color.FromArgb(255, 102, 171);
    static readonly Color SoftAccent = Color.FromArgb(53, 27, 44);
    static readonly PrivateFontCollection fonts = new PrivateFontCollection();
    static readonly PrivateFontCollection boldFonts = new PrivateFontCollection();
    internal static void LoadFonts() {
        var dir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","fonts");
        foreach (var file in new[] { "Nunito-SemiBold.ttf", "Nunito-Bold.ttf" }) {
            var path = Path.Combine(dir,file);
            if (!File.Exists(path)) continue;
            (file == "Nunito-Bold.ttf" ? boldFonts : fonts).AddFontFile(path);
            AddFontResourceEx(path, 0x10, IntPtr.Zero);
        }
    }
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    static extern int AddFontResourceEx(string path, uint flags, IntPtr reserved);
    static Font UiFont(float size = 10, FontStyle weight = FontStyle.Regular) {
        var family = ((weight & FontStyle.Bold) != 0 ? boldFonts : fonts).Families.FirstOrDefault();
        if (family == null) return new Font("Segoe UI",size,weight);
        var style = family.IsStyleAvailable(weight) ? weight : family.IsStyleAvailable(FontStyle.Regular) ? FontStyle.Regular : FontStyle.Bold;
        return new Font(family,size,style);
    }
    static readonly string[] Resolutions = { "1280x720", "1920x1080", "2560x1440", "3840x2160" };
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    readonly HttpClient http = new HttpClient(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(100) };
    readonly Label status = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Muted, AutoEllipsis = true };
    readonly PictureBox preview = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Base, Margin = new Padding(0) };
    readonly Label replayTitle = new Label { Dock = DockStyle.Fill, AutoEllipsis = true, UseMnemonic = false, ForeColor = Ink, TextAlign = ContentAlignment.MiddleLeft };
    readonly Label previewTag = new Label { Text = "Démonstration", ForeColor = Muted, TextAlign = ContentAlignment.MiddleCenter, Dock = DockStyle.Fill };
    readonly Label replayStats = new Label { Dock = DockStyle.Top, Height = 52, UseMnemonic = false, AutoEllipsis = true, ForeColor = Muted, Padding = new Padding(12, 6, 8, 0) };
    readonly FlowLayoutPanel presetCards = new FlowLayoutPanel { WrapContents = true, BackColor = Base };
    readonly Timer pulse = new Timer { Interval = 50 };
    readonly Timer playTimer = new Timer { Interval = 800 };
    readonly Timer mediaTimer = new Timer { Interval = 125 };
    readonly ListBox replays = List(), placed = List();
    readonly ListBox videos = List();
    readonly TextBox search = new TextBox { BackColor = Panel, ForeColor = Ink, BorderStyle = BorderStyle.None };
    readonly ComboBox preset = Picker(), resolution = Picker(), fps = Picker(), skin = Picker();
    readonly ComboBox encoder = Picker();
    readonly ValueSlider scale = new ValueSlider(20,400,100), opacity = new ValueSlider(5,100,100);
    readonly NumberBox clipStart = Number(0, 1800, 0), clipEnd = Number(0, 1800, 0);
    readonly ValueSlider music = new ValueSlider(0,100,50), effects = new ValueSlider(0,100,50), dim = new ValueSlider(0,100,92);
    readonly CheckBox intro = new SwitchToggle { Text = "Intro" }, outro = new SwitchToggle { Text = "Fin" };
    readonly Scrubber position = new Scrubber { Value = 45, Dock = DockStyle.Fill, Margin = new Padding(10, 2, 10, 0) };
    readonly Timer renderPoll = new Timer { Interval = 1000 };
    Process worker, tosu;
    Task settingsWrite = Task.CompletedTask;
    Json state, app, library;
    List<object> widgets = new List<object>();
    string token;
    bool updating, loadingPreview, previewPending, rendering, pollBusy;
    PointF dragOrigin;
    Json dragged;
    double originalX, originalY;
    Button test, export, cancel;
    Button play, mode;
    Button playResult;
    Control replayPane, videoPane;
    TableLayoutPanel leftTabs;
    Panel stageSurface;
    ElementHost mediaHost;
    MediaElement media;
    string videoFile, latestVideo;
    bool videosOpen, mediaPlaying;
    Button removeWidget;
    TableLayoutPanel inspectorTabs;
    TableLayoutPanel sceneTabs;
    int activeScene = 1;
    int displayedScene = -1;
    TableLayoutPanel blurButtons;
    int blurChoice = -1;
    bool blurChanged;
    bool editing;

    public DancingWindow()
    {
        Text = "Dancing!";
        Font = UiFont(10);
        ForeColor = Ink; BackColor = Base;
        Width = 1450; Height = 860; MinimumSize = new Size(1050, 670);
        StartPosition = FormStartPosition.CenterScreen;
        KeyPreview = true;
        replays.AccessibleName = "Replays";
        search.AccessibleName = "Rechercher un replay";
        placed.AccessibleName = "Widgets du montage";
        preset.AccessibleName = "Preset du montage";
        preview.AccessibleName = "Aperçu du montage";

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(13, 4, 13, 2) };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 27));
        var top = Bar(); top.Padding = new Padding(0, 6, 0, 0);
        var logo = new Panel { Size = new Size(28, 30), Margin = new Padding(3, 4, 0, 0) };
        logo.Paint += (s,e) => {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var ring = new Pen(Accent, 2.4f)) e.Graphics.DrawEllipse(ring, 3, 4, 21, 21);
            float radius = 4.4f + (float)Math.Pow(Math.Max(0, Math.Sin(DateTime.UtcNow.TimeOfDay.TotalSeconds * 3.9)), 8);
            using (var fill = new SolidBrush(Accent)) e.Graphics.FillEllipse(fill, 13.5f-radius, 14.5f-radius, radius*2, radius*2);
        };
        pulse.Tick += (s,e) => logo.Invalidate();
        var brand = new Label { Text = "Dancing!", AutoSize = true, Font = UiFont(14,FontStyle.Bold), ForeColor = Ink, Margin = new Padding(6, 5, 24, 0) };
        top.Controls.Add(logo); top.Controls.Add(brand);
        top.Controls.Add(Action("Bibliothèque de widgets", ShowLibrary));
        top.Controls.Add(Action("Configuration osu!", Configure));
        layout.Controls.Add(top, 0, 0);

        var workspace = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1 };
        workspace.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 21));
        workspace.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 53));
        workspace.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 26));
        var import = Action("＋   Ajouter un replay", ImportReplay); import.Height = 43; import.Dock = DockStyle.Top;
        import.AccessibleDescription = "Glisser-déposer un fichier .osr ou cliquer pour le parcourir.";
        import.AllowDrop = true;
        import.DragEnter += (s,e) => e.Effect = ReplayDrop(e.Data) == null ? DragDropEffects.None : DragDropEffects.Copy;
        import.DragDrop += async (s,e) => {
            var file = ReplayDrop(e.Data);
            if (file != null) await Run(() => ImportReplay(file));
        };
        var leftHeader = new Panel { Dock = DockStyle.Top, Height = 75, Padding = new Padding(2, 2, 4, 8) };
        var leftNav = leftTabs = Segment(new[] { "Replays", "Vidéos" }, 0, async i => {
            await Run(i == 0 ? (Func<Task>)ShowReplays : ShowVideos);
        });
        leftNav.Dock = DockStyle.Top;
        var searchFrame = new InputFrame(search, true) { Dock = DockStyle.Top }; leftHeader.Controls.Add(searchFrame); leftHeader.Controls.Add(import); leftHeader.Height = 86;
        search.Margin = new Padding(0, 5, 0, 4);
        replays.ItemHeight = 63; replays.DrawItem += DrawReplay;
        replayPane = Column(ListFrame(replays), leftHeader, new Panel { Height = 2 });
        var videoFooter = Bar(Action("Ouvrir le dossier", () => Api("/api/reveal", new Json())));
        videoPane = Column(ListFrame(videos), new Panel { Height = 2 }, videoFooter);
        var left = new Panel { Dock = DockStyle.Fill };
        left.Controls.Add(videoPane); left.Controls.Add(replayPane); left.Controls.Add(leftNav);
        videoPane.Visible = false;
        workspace.Controls.Add(left, 0, 0);

        sceneTabs = Segment(new[] { "Intro", "Jeu", "Fin" }, 1, i => ChangeScene(i));
        mode = Action("Modifier la disposition", () => { SetEditing(!editing); return Task.CompletedTask; });
        mode.Dock = DockStyle.Right;
        var toolbar = new Panel { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 5) };
        toolbar.Controls.Add(previewTag); toolbar.Controls.Add(sceneTabs); toolbar.Controls.Add(mode);
        var outputs = Bar(); outputs.FlowDirection = FlowDirection.RightToLeft;
        test = Action("Tester 12 s", () => StartRender("preview"));
        export = Action("Exporter la vidéo", () => StartRender("full"));
        ((ThemedButton)export).Primary = true;
        cancel = Action("Annuler le rendu", () => Api("/api/cancel", new Json()));
        playResult = Action("Lire le rendu", () => OpenLatestVideo());
        playResult.Visible = false;
        outputs.Controls.AddRange(new Control[] { export, test, cancel, playResult });
        var dock = new Panel { Dock = DockStyle.Fill, BackColor = Panel, Padding = new Padding(5), Margin = new Padding(0, 7, 0, 0) };
        dock.Resize += (s,e) => {
            if(dock.Width<1||dock.Height<1)return;
            var before=dock.Region;
            using(var mask=Round(dock.ClientRectangle,12)) dock.Region=new Region(mask);
            if(before!=null)before.Dispose();
        };
        outputs.Dock = DockStyle.Bottom; dock.Controls.Add(outputs); dock.Controls.Add(replayStats);
        replayStats.Paint += PaintReplayStats;
        var transport = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 1, ColumnCount = 2, Margin = new Padding(0, 4, 0, 0) };
        transport.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 42)); transport.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        play = Action("▶", TogglePlayback);
        play.AccessibleName = "Lecture ou pause";
        transport.Controls.Add(play, 0, 0); transport.Controls.Add(position, 1, 0);
        var stage = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 6, ColumnCount = 1, Padding = new Padding(13, 0, 13, 0) };
        stage.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        stage.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        stage.RowStyles.Add(new RowStyle(SizeType.Absolute, 320));
        stage.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        stage.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        stage.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        stage.Controls.Add(replayTitle, 0, 0); stage.Controls.Add(toolbar, 0, 1);
        stageSurface = new Panel { Dock = DockStyle.Fill, BackColor = Base, Margin = new Padding(0) };
        stageSurface.Controls.Add(preview);
        stage.Controls.Add(stageSurface, 0, 2); stage.Controls.Add(transport, 0, 3); stage.Controls.Add(dock, 0, 4);
        stage.SizeChanged += (s,e) => stage.RowStyles[2].Height = Math.Max(100, Math.Min((stage.Width-26)*9f/16,stage.Height-202));
        workspace.Controls.Add(stage, 1, 0);

        var inspector = new Panel { Dock = DockStyle.Fill, Padding = new Padding(6, 0, 0, 0) };
        var edit = new Panel { Dock = DockStyle.Fill, BackColor = Base, Visible = false };
        var output = new Panel { Dock = DockStyle.Fill, BackColor = Base };
        var more = new Panel { Dock = DockStyle.Fill, BackColor = Base, Visible = false };
        var panels = new[] { output, edit, more };
        var tabs = inspectorTabs = Segment(new[] { "Rendu", "Montage", "Options" }, 0, i => {
            for (int n = 0; n < panels.Length; n++) panels[n].Visible = i == n;
        }, true);
        tabs.Dock = DockStyle.Top; tabs.Height = 48;
        inspector.Controls.AddRange(panels); inspector.Controls.Add(tabs);
        more.Controls.Add(Bar(Action("Démarrer tosu (OBS)", StartTosu), Action("Configuration osu!", Configure), Action("Compte osu!", ConfigureAccount)));
        var tools = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 143, FlowDirection = FlowDirection.TopDown, WrapContents = false };
        tools.Controls.Add(Bar(TextLabel("Échelle"), scale));
        tools.Controls.Add(Bar(TextLabel("Opacité"), opacity));
        removeWidget = Action("Retirer du montage", RemoveWidget);
        tools.Controls.Add(Bar(removeWidget, Action("Ajouter un widget", ShowLibrary)));
        tools.Controls.Add(Bar(Action("Enregistrer le preset", SavePreset), Action("Couleurs", ChooseColors)));
        var editHeader = new Panel { Dock = DockStyle.Top, Height = 245, Padding = new Padding(2, 8, 2, 6) };
        var cardScroll = new ScrollFrame(presetCards, width => {
            foreach (Control card in presetCards.Controls) card.Width = Math.Max(60,width/2 - 7);
            return (presetCards.Controls.Count + 1) / 2 * 66;
        }) { Dock = DockStyle.Fill };
        presetCards.ControlAdded += (s,e) => cardScroll.UpdateContent();
        presetCards.ControlRemoved += (s,e) => cardScroll.UpdateContent();
        editHeader.Controls.Add(cardScroll); editHeader.Controls.Add(Heading("PRESETS"));
        placed.ItemHeight = 34;
        edit.Controls.Add(ListFrame(placed)); edit.Controls.Add(tools); edit.Controls.Add(editHeader);
        var options = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(10) };
        options.Controls.Add(Heading("VIDÉO"));
        resolution.Items.AddRange(Resolutions); fps.Items.AddRange(new object[] { "30", "60", "120", "240" });
        var sizes = Segment(new[] { "720p", "1080p", "1440p", "4K" }, -1, i => resolution.SelectedIndex = i);
        var rates = Segment(new[] { "30", "60", "120", "240" }, -1, i => fps.SelectedIndex = i);
        resolution.SelectedIndexChanged += (s,e) => SelectSegment(sizes,resolution.SelectedIndex);
        fps.SelectedIndexChanged += (s,e) => SelectSegment(rates,fps.SelectedIndex);
        options.Controls.Add(TextLabel("Résolution")); options.Controls.Add(sizes);
        options.Controls.Add(TextLabel("Images par seconde")); options.Controls.Add(rates);
        encoder.Items.AddRange(new object[] { "libx264", "libx265", "h264_nvenc", "hevc_nvenc", "h264_amf", "hevc_amf", "h264_qsv", "hevc_qsv", "libsvtav1" });
        options.Controls.Add(TextLabel("Encodeur")); options.Controls.Add(encoder);
        options.Controls.Add(Heading("FLOU DE MOUVEMENT"));
        blurButtons = Segment(new[] { "Aucun", "Léger", "Équilibré", "Cinéma" }, -1, i => { blurChoice = i; blurChanged = true; });
        options.Controls.Add(blurButtons);
        options.Controls.Add(Heading("SON ET JEU"));
        options.Controls.Add(Bar(TextLabel("Musique"), music));
        options.Controls.Add(Bar(TextLabel("Effets"), effects));
        options.Controls.Add(Bar(TextLabel("Fond assombri"), dim));
        options.Controls.Add(Heading("SKIN ET SCÈNES"));
        options.Controls.Add(TextLabel("Skin")); options.Controls.Add(skin);
        options.Controls.Add(Bar(intro, outro));
        options.Controls.Add(Heading("PLAGE DU REPLAY"));
        options.Controls.Add(Bar(TextLabel("Début (s)"), new InputFrame(clipStart, false) { Width = 74 }, TextLabel("Fin (s)"), new InputFrame(clipEnd, false) { Width = 74 }));
        output.Controls.Add(new ScrollFrame(options, width => options.Padding.Vertical + options.Controls.Cast<Control>().Sum(c => c.Height + c.Margin.Vertical)));
        workspace.Controls.Add(inspector, 2, 0);
        layout.Controls.Add(workspace, 0, 1); layout.Controls.Add(status, 0, 2);
        Controls.Add(layout);

        search.TextChanged += (s, e) => FillReplays();
        replays.SelectedIndexChanged += (s, e) => { UpdateReplaySummary(); SetButtons(); };
        placed.SelectedIndexChanged += (s, e) => UpdateSelection();
        preset.SelectionChangeCommitted += async (s, e) => await Run(ApplyPreset);
        scale.ValueChanged += async (s, e) => await ChangeWidget("s", (double)scale.Value / 100);
        opacity.ValueChanged += async (s, e) => await ChangeWidget("o", (double)opacity.Value / 100);
        position.MouseUp += async (s, e) => await Run(SeekPlayback);
        position.KeyUp += async (s, e) => await Run(SeekPlayback);
        videos.DoubleClick += async (s,e) => await Run(() => OpenVideo(TextOf(Selected(videos),"name")));
        videos.KeyDown += async (s,e) => {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true; await Run(() => OpenVideo(TextOf(Selected(videos),"name")));
        };
        mediaTimer.Tick += (s,e) => UpdateMediaPosition();
        playTimer.Tick += async (s, e) => {
            if (loadingPreview) return;
            position.Value = (position.Value + 1) % 101;
            await Run(RefreshPreview);
        };
        mode.Click += (s, e) => { if (editing) ((Button)tabs.Controls[1]).PerformClick(); };
        renderPoll.Tick += async (s, e) => await PollRender();
        preview.Paint += DrawSelection;
        preview.MouseDown += PickWidget;
        preview.MouseMove += MoveWidget;
        preview.MouseUp += async (s, e) => {
            if (dragged == null) return;
            dragged = null; preview.Capture = false;
            await Run(SaveAndPreview);
        };
        var menu = new ContextMenuStrip();
        var remove = menu.Items.Add("Retirer du montage");
        remove.Click += async (s, e) => await Run(RemoveWidget);
        menu.Opening += (s, e) => e.Cancel = placed.SelectedIndex < 0;
        preview.ContextMenuStrip = menu;
        KeyDown += async (s, e) => {
            if (e.KeyCode != Keys.Delete || placed.SelectedIndex < 0 || ActiveControl is TextBox || ActiveControl is NumericUpDown) return;
            e.SuppressKeyPress = true; await Run(RemoveWidget);
        };
        Shown += async (s, e) => {
            ApplyDarkCaption(this); Hint(search,"Joueur, map, difficulté…");
            pulse.Start(); await Run(Start);
        };
        FormClosing += (s, e) => {
            if (rendering) e.Cancel = MessageBox.Show(this, "Un rendu est en cours. Quitter Dancing! et l’annuler ?", "Dancing!", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes;
        };
        FormClosed += (s, e) => {
            mediaTimer.Dispose(); playTimer.Dispose(); pulse.Dispose();
            if (media != null) media.Close();
            StopChildren();
        };
        SetButtons();
    }

    static ListBox List() {
        var list = new WebList { Dock = DockStyle.Fill, BackColor = Base, ForeColor = Ink, BorderStyle = BorderStyle.None, IntegralHeight = false, DrawMode = DrawMode.OwnerDrawFixed, ItemHeight = 29 };
        list.DrawItem += (s,e) => {
            if (e.Index < 0 || list.ItemHeight > 40) return;
            DrawRow(e, list.Items[e.Index].ToString());
        };
        return list;
    }
    static Control ListFrame(ListBox list) {
        var frame = new Panel { Dock = DockStyle.Fill, BackColor = Base };
        Func<int> page = () => Math.Max(1,list.ClientSize.Height / Math.Max(1,list.ItemHeight));
        var rail = new ScrollRail(() => list.Items.Count, page, () => list.TopIndex, value => {
            if (list.Items.Count > 0) list.TopIndex = value;
        });
        frame.Controls.Add(list); frame.Controls.Add(rail);
        ((WebList)list).ScrollChanged += (s,e) => rail.Invalidate();
        return frame;
    }
    [DllImport("user32.dll")]
    static extern bool ShowScrollBar(IntPtr window, int bar, bool show);
    sealed class WebList : ListBox {
        public event EventHandler ScrollChanged;
        public int Hover = -1;
        bool hiding;
        void SetHover(int i) { if (i == Hover) return; int old = Hover; Hover = i; if (old >= 0 && old < Items.Count) Invalidate(GetItemRectangle(old)); if (i >= 0 && i < Items.Count) Invalidate(GetItemRectangle(i)); }
        protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); int i = IndexFromPoint(e.Location); SetHover(i == ListBox.NoMatches ? -1 : i); Cursor = Hover >= 0 ? Cursors.Hand : Cursors.Default; }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); SetHover(-1); }
        protected override void WndProc(ref Message m) {
            base.WndProc(ref m);
            if (hiding || !IsHandleCreated || (m.Msg != 0xF && m.Msg != 0x5 && m.Msg != 0x115 && m.Msg != 0x197 && m.Msg != 0x100)) return;
            try { hiding = true; ShowScrollBar(Handle, 1, false); }
            finally { hiding = false; }
            if (ScrollChanged != null) ScrollChanged(this,EventArgs.Empty);
        }
        protected override void OnMouseWheel(MouseEventArgs e) {
            int page = Math.Max(1, ClientSize.Height / Math.Max(1,ItemHeight));
            if (Items.Count > 0) TopIndex = Math.Max(0,Math.Min(Math.Max(0,Items.Count-page),TopIndex-Math.Sign(e.Delta)*Math.Max(1,Math.Abs(e.Delta)/120)));
            SetHover(IndexFromPoint(PointToClient(MousePosition)));
            if (ScrollChanged != null) ScrollChanged(this,EventArgs.Empty);
        }
    }
    sealed class ScrollRail : Control {
        readonly Func<int> extent, page, offset;
        readonly System.Action<int> scroll;
        int grab;
        public ScrollRail(Func<int> extent, Func<int> page, Func<int> offset, System.Action<int> scroll) {
            this.extent=extent; this.page=page; this.offset=offset; this.scroll=scroll;
            Width=9; Dock=DockStyle.Right; AccessibleName="Barre de défilement";
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }
        int Limit { get { return Math.Max(0,extent()-page()); } }
        Rectangle Thumb() {
            int h=Math.Min(Height-4,Math.Max(23,(Height-4)*page()/Math.Max(1,extent())));
            int y=2+(Height-4-h)*Math.Max(0,Math.Min(Limit,offset()))/Math.Max(1,Limit);
            return new Rectangle(2,y,6,Math.Max(1,h));
        }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Base);
            if (Limit == 0 || Height < 6) return;
            e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            using(var path=Round(Thumb(),3))
            using(var brush=new SolidBrush(Capture ? Muted : Color.FromArgb(42,42,50))) e.Graphics.FillPath(brush,path);
        }
        protected override void OnMouseDown(MouseEventArgs e) {
            if (e.Button != MouseButtons.Left || Limit == 0) return;
            var thumb=Thumb(); grab=thumb.Contains(e.Location)?e.Y-thumb.Y:thumb.Height/2;
            Capture=true; Drag(e.Y);
        }
        protected override void OnMouseMove(MouseEventArgs e) { if(Capture) Drag(e.Y); }
        protected override void OnMouseUp(MouseEventArgs e) { Capture=false; Invalidate(); }
        protected override void OnMouseWheel(MouseEventArgs e) {
            scroll(Math.Max(0,Math.Min(Limit,offset()-e.Delta/120*Math.Max(1,page()/5)))); Invalidate();
        }
        void Drag(int y) {
            scroll(Math.Max(0,Math.Min(Limit,(int)Math.Round((y-grab-2)*Limit/(double)Math.Max(1,Height-4-Thumb().Height)))));
            Invalidate();
        }
    }
    sealed class ScrollFrame : Panel, IMessageFilter {
        readonly Panel viewport=new Panel { Dock=DockStyle.Fill };
        readonly Control content;
        readonly Func<int,int> measure;
        readonly ScrollRail rail;
        int offset, length;
        bool sizing;
        public event EventHandler Scrolled;
        public ScrollFrame(Control content, Func<int,int> measure) {
            this.content=content;this.measure=measure;Dock=DockStyle.Fill;BackColor=Base;
            rail=new ScrollRail(()=>length,()=>viewport.Height,()=>offset,ScrollTo);
            viewport.Controls.Add(content); Controls.Add(viewport); Controls.Add(rail);
            content.Dock=DockStyle.None;
            viewport.SizeChanged+=(s,e)=>UpdateContent();
        }
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); Application.AddMessageFilter(this); }
        protected override void OnHandleDestroyed(EventArgs e) { Application.RemoveMessageFilter(this); base.OnHandleDestroyed(e); }
        public bool PreFilterMessage(ref Message m) {
            if (m.Msg != 0x20A || !Visible || FindForm() != Form.ActiveForm || !viewport.RectangleToScreen(viewport.ClientRectangle).Contains(Control.MousePosition)) return false;
            if (length <= viewport.Height) return false;
            int delta = unchecked((short)((long)m.WParam >> 16));
            ScrollTo(offset-delta/120*75);
            return true;
        }
        public int Offset { get { return offset; } }
        public int Page { get { return viewport.Height; } }
        public void UpdateContent() {
            if(sizing||viewport.Width<1) return;
            sizing=true;
            try { length=Math.Max(0,measure(viewport.Width)); content.Size=new Size(viewport.Width,length); }
            finally { sizing=false; }
            ScrollTo(offset);
        }
        public void ScrollTo(int value) {
            offset=Math.Max(0,Math.Min(Math.Max(0,length-viewport.Height),value));
            content.Location=new Point(0,-offset); rail.Invalidate();
            if(Scrolled!=null) Scrolled(this,EventArgs.Empty);
        }
    }
    sealed class SwitchToggle : CheckBox {
        public SwitchToggle() {
            AutoSize=false; Size=new Size(100,29); Cursor=Cursors.Hand;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint,true);
        }
        protected override void OnCheckedChanged(EventArgs e) { Invalidate(); base.OnCheckedChanged(e); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Parent == null ? Base : Parent.BackColor);
            e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            var box=new Rectangle(1,4,35,20);
            using(var path=Round(box,10)) using(var fill=new SolidBrush(Checked ? Accent : Line)) e.Graphics.FillPath(fill,path);
            using(var knob=new SolidBrush(Ink)) e.Graphics.FillEllipse(knob,Checked ? 18 : 4,7,14,14);
            TextRenderer.DrawText(e.Graphics,Text,Font,new Rectangle(43,0,Width-43,Height),Ink,TextFormatFlags.VerticalCenter);
            if(Focused) ControlPaint.DrawFocusRectangle(e.Graphics,ClientRectangle);
        }
    }
    sealed class ValueSlider : Control {
        readonly int min,max;
        int value, start;
        public event EventHandler ValueChanged;
        public decimal Value {
            get { return value; }
            set { int next=Math.Max(min,Math.Min(max,(int)Math.Round(value))); if(next!=this.value){this.value=next;Notify();} }
        }
        public ValueSlider(int min,int max,int initial) {
            this.min=min;this.max=max;value=initial;
            Size=new Size(157,24); Cursor=Cursors.Hand; TabStop=true;
            SetStyle(ControlStyles.Selectable | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint,true);
        }
        public decimal Clamp(double n) { return (decimal)Math.Max(min,Math.Min(max,n)); }
        protected override bool IsInputKey(Keys key) { return key==Keys.Left||key==Keys.Right||base.IsInputKey(key); }
        protected override void OnKeyDown(KeyEventArgs e) {
            if(e.KeyCode==Keys.Left||e.KeyCode==Keys.Right){Value+=e.KeyCode==Keys.Right?1:-1;e.Handled=true;}
            base.OnKeyDown(e);
        }
        void Notify() { Invalidate(); if(ValueChanged!=null)ValueChanged(this,EventArgs.Empty); }
        protected override void OnMouseDown(MouseEventArgs e) { if(e.Button==MouseButtons.Left){Focus();Capture=true;start=value;Drag(e.X);} }
        protected override void OnMouseMove(MouseEventArgs e) { if(Capture)Drag(e.X); }
        protected override void OnMouseUp(MouseEventArgs e) { if(Capture){Capture=false;if(start!=value)Notify();} }
        void Drag(int x) { value=(int)Math.Round(Clamp(min+(max-min)*(x-8)/Math.Max(1.0,Width-52)));Invalidate(); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Parent==null?Base:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            int end=Width-44, x=8+(end-8)*(value-min)/(max-min), y=Height/2;
            using(var rail=new Pen(Line,4)){rail.StartCap=rail.EndCap=LineCap.Round;e.Graphics.DrawLine(rail,8,y,end,y);}
            if(x>8)using(var fill=new Pen(Enabled?Accent:Muted,4)){fill.StartCap=fill.EndCap=LineCap.Round;e.Graphics.DrawLine(fill,8,y,x,y);}
            using(var thumb=new SolidBrush(Enabled?Ink:Muted))e.Graphics.FillEllipse(thumb,x-6,y-6,12,12);
            TextRenderer.DrawText(e.Graphics,value+" %",Font,new Rectangle(end+8,0,Width-end-7,Height),Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine);
            if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,ClientRectangle);
        }
    }
    static ComboBox Picker() {
        var combo = new WebCombo { DropDownStyle = ComboBoxStyle.DropDownList, Width = 250, FlatStyle = FlatStyle.Flat, BackColor = Panel, ForeColor = Ink, DrawMode = DrawMode.OwnerDrawFixed, ItemHeight = 24 };
        combo.DrawItem += (s,e) => {
            if (e.Index < 0) { using (var b = new SolidBrush(Panel)) e.Graphics.FillRectangle(b,e.Bounds); return; }
            DrawRow(e, combo.Items[e.Index].ToString());
        };
        return combo;
    }
    static void DrawRow(DrawItemEventArgs e, string text) {
        bool selected = (e.State & DrawItemState.Selected) != 0;
        using (var brush = new SolidBrush(selected ? SoftAccent : Panel)) e.Graphics.FillRectangle(brush, e.Bounds);
        var label = Rectangle.Inflate(e.Bounds, -8, 0);
        TextRenderer.DrawText(e.Graphics, text, e.Font, label, Ink, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine);
        e.DrawFocusRectangle();
    }
    void DrawReplay(object sender, DrawItemEventArgs e) {
        if (e.Index < 0) return;
        var item = replays.Items[e.Index] as Item;
        if (item == null) return;
        var row = item.Data; var r = Rectangle.Inflate(e.Bounds, -1, -2);
        bool selected = (e.State & DrawItemState.Selected) != 0;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var baseBrush = new SolidBrush(Base)) e.Graphics.FillRectangle(baseBrush, e.Bounds);
        bool hover = ((WebList)replays).Hover == e.Index;
        using (var path = Round(r, 9))
        using (var fill = new SolidBrush(selected ? Raised : hover ? Color.FromArgb(19, 19, 23) : Base)) e.Graphics.FillPath(fill, path);
        if (selected) using (var fill = new SolidBrush(Accent)) e.Graphics.FillRectangle(fill, r.X + 2, r.Y + 9, 3, r.Height - 18);
        string title = TextOf(row, "song"), artist = TextOf(row, "player"), diff = TextOf(row, "diff");
        string acc = Num(row, "acc").ToString("0.00", CultureInfo.GetCultureInfo("fr-FR")) + " %";
        var modeList = Field(row, "mods") as object[] ?? new object[0];
        const TextFormatFlags flags = TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix;
        using (var bold = UiFont(Font.Size,FontStyle.Bold)) {
            TextRenderer.DrawText(e.Graphics, title, bold, new Rectangle(r.X + 13, r.Y + 6, Math.Max(1,r.Width - 94), 19), Ink, flags);
            TextRenderer.DrawText(e.Graphics, acc, bold, new Rectangle(r.Right - 81, r.Y + 6, 74, 19), selected ? Accent : Ink, flags | TextFormatFlags.Right | TextFormatFlags.NoPadding);
        }
        TextRenderer.DrawText(e.Graphics, "[" + diff + "] · " + artist, Font, new Rectangle(r.X + 13, r.Y + 24, Math.Max(1,r.Width - 20), 17), Muted, flags);
        int x = r.X + 13, y = r.Y + 42;
        using (var chipFont = UiFont(6.8f, FontStyle.Bold)) using (var small = UiFont(7.8f)) {
            foreach (var m in modeList.Select(v => Convert.ToString(v))) {
                Color bg, fg; ChipColors(m, out bg, out fg);
                int w = TextRenderer.MeasureText(m, chipFont, Size.Empty, TextFormatFlags.NoPadding).Width + 10;
                using (var path = Round(new Rectangle(x, y, w, 15), 4)) using (var b = new SolidBrush(bg)) e.Graphics.FillPath(b, path);
                TextRenderer.DrawText(e.Graphics, m, chipFont, new Rectangle(x, y, w, 15), fg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                x += w + 5;
            }
            var tail = Num(row, "combo") + "×";
            TextRenderer.DrawText(e.Graphics, tail, small, new Point(x, y), Color.FromArgb(99, 99, 110), TextFormatFlags.NoPadding);
            x += TextRenderer.MeasureText(tail, small, Size.Empty, TextFormatFlags.NoPadding).Width + 8;
            if (Num(row, "miss") > 0) TextRenderer.DrawText(e.Graphics, Num(row, "miss") + " miss", small, new Rectangle(x, y, Math.Max(0, r.Right - 86 - x), 16), Color.FromArgb(255, 107, 107), TextFormatFlags.NoPadding | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine);
            TextRenderer.DrawText(e.Graphics, Ago(TextOf(row, "date")), small, new Rectangle(r.Right - 80, y, 72, 16), Color.FromArgb(99, 99, 110), TextFormatFlags.Right | TextFormatFlags.NoPadding);
        }
        e.DrawFocusRectangle();
    }
    static void ChipColors(string mod, out Color bg, out Color fg) {
        switch (mod) {
            case "DT": case "NC": bg = Color.FromArgb(51, 41, 95); fg = Color.FromArgb(214, 208, 255); break;
            case "HD": bg = Color.FromArgb(77, 62, 21); fg = Color.FromArgb(255, 224, 138); break;
            case "HR": bg = Color.FromArgb(79, 31, 35); fg = Color.FromArgb(255, 179, 182); break;
            case "EZ": bg = Color.FromArgb(34, 64, 42); fg = Color.FromArgb(181, 242, 187); break;
            case "RX": case "AP": bg = Color.FromArgb(27, 58, 75); fg = Color.FromArgb(167, 227, 255); break;
            default: bg = Color.FromArgb(36, 36, 43); fg = Color.FromArgb(207, 207, 216); break;
        }
    }
    static string Ago(string iso) {
        DateTime d; if (!DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out d)) return "";
        var s = (DateTime.UtcNow - d.ToUniversalTime()).TotalSeconds;
        if (s < 3600) return Math.Max(1, (int)(s / 60)) + " min"; if (s < 86400) return (int)(s / 3600) + " h";
        if (s < 86400 * 30) return (int)(s / 86400) + " j"; return d.ToLocalTime().ToString("dd/MM/yyyy");
    }
    static Label Heading(string text) {
        return new Label { Text = text.ToUpperInvariant(), Dock = DockStyle.Top, Height = 30, ForeColor = Color.FromArgb(99, 99, 110), Font = UiFont(7.6f, FontStyle.Bold), UseMnemonic = false, Padding = new Padding(2, 12, 0, 0), TextAlign = ContentAlignment.BottomLeft };
    }
    TableLayoutPanel Segment(string[] labels, int selected, System.Action<int> click, bool tabs = false) {
        var bar = new AnimatedSegment(tabs) { Dock = DockStyle.Left, Width = labels.Length * 65, Height = 37, RowCount = 1, ColumnCount = labels.Length, Padding = new Padding(2) };
        bar.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        for (int i = 0; i < labels.Length; i++) {
            int index = i;
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / labels.Length));
            var button = Action(labels[i], () => { SelectSegment(bar, index); click(index); return Task.CompletedTask; });
            if(tabs) ((ThemedButton)button).Glyph = new[] { "film", "layers", "sliders" }[i];
            button.AutoSize = false; button.Dock = DockStyle.Fill; button.Margin = new Padding(1);
            bar.Controls.Add(button, i, 0);
        }
        SelectSegment(bar, selected);
        return bar;
    }
    static void SelectSegment(Control bar, int active) {
        for (int i = 0; i < bar.Controls.Count; i++) {
            var button = (ThemedButton)bar.Controls[i]; button.Selected = i == active; button.Invalidate();
        }
        var segment = bar as AnimatedSegment;
        if(segment!=null)segment.Select(active);
    }
    sealed class AnimatedSegment : TableLayoutPanel {
        readonly Timer timer = new Timer { Interval=16 };
        readonly Stopwatch motion = new Stopwatch();
        readonly bool underline;
        public bool IsTabs { get { return underline; } }
        int selected = -1;
        RectangleF from, current;
        public AnimatedSegment(bool underline) {
            this.underline=underline;BackColor=underline?Base:Panel;
            SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.AllPaintingInWmPaint|ControlStyles.UserPaint,true);
            timer.Tick+=(s,e)=>{
                double p=Math.Min(1,motion.Elapsed.TotalMilliseconds/(underline?350:300));
                var target=Target();
                float ease=InterfaceEase(p);
                current=new RectangleF(from.X+(target.X-from.X)*ease,target.Y,from.Width+(target.Width-from.Width)*ease,target.Height);
                Redraw();
                if(p>=1) {timer.Stop();motion.Stop();}
            };
        }
        RectangleF Target() {
            if(selected<0||selected>=Controls.Count)return RectangleF.Empty;
            var b=Controls[selected].Bounds;
            return underline
                ? new RectangleF(b.Left+7,Height-3,Math.Max(0,b.Width-14),2)
                : new RectangleF(b.Left+1,b.Top+1,Math.Max(0,b.Width-2),Math.Max(0,b.Height-2));
        }
        public void Select(int index) {
            if(index==selected)return;
            selected=index;
            if(index<0||current.Width<1||!Visible) {timer.Stop();current=Target();Redraw();return;}
            from=current;motion.Restart();timer.Start();
        }
        protected override void OnLayout(LayoutEventArgs e) {
            base.OnLayout(e);
            if(!timer.Enabled)current=Target();
        }
        void Redraw() { Invalidate(); foreach(Control child in Controls)child.Invalidate(); }
        public void PaintThumb(Graphics g,Point origin) {
            if(current.Width<1||current.Height<1)return;
            var r=Rectangle.Round(current);r.Offset(-origin.X,-origin.Y);
            using(var path=Round(r,underline?1:7)) {
                using(var b=new SolidBrush(underline?Accent:Color.FromArgb(28,28,33)))g.FillPath(b,path);
                if(!underline)using(var edge=new Pen(Color.FromArgb(38,38,45)))g.DrawPath(edge,path);
            }
        }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            if(underline)using(var edge=new Pen(Line))e.Graphics.DrawLine(edge,0,Height-1,Width,Height-1);
            PaintThumb(e.Graphics,Point.Empty);
        }
        protected override void Dispose(bool disposing) { if(disposing)timer.Dispose();base.Dispose(disposing); }
    }
    static float InterfaceEase(double progress) {
        double low=0,high=1;
        for(int i=0;i<10;i++) {
            double t=(low+high)/2, u=1-t;
            double x=.6*u*u*t+.6*u*t*t+t*t*t;
            if(x<progress)low=t;else high=t;
        }
        double p=(low+high)/2, q=1-p;
        return progress>=1?1:(float)(2.4*q*q*p+3*q*p*p+p*p*p);
    }
    void UpdateReplaySummary() {
        var replay = Selected(replays);
        replayTitle.Text = replay == null ? "Aucun replay sélectionné" : TextOf(replay, "song") + "  ·  " + TextOf(replay, "diff") + "  ·  " + TextOf(replay, "player");
        replayStats.Invalidate();
    }
    void PaintReplayStats(object sender,PaintEventArgs e) {
        var replay=Selected(replays);
        if(replay==null) { TextRenderer.DrawText(e.Graphics,"Choisis un replay dans la bibliothèque.",Font,new Point(12,12),Muted); return; }
        var culture=CultureInfo.GetCultureInfo("fr-FR");
        var labels=new[]{"PRÉCISION","COMBO","MISS","SCORE"};
        var values=new[]{Num(replay,"acc").ToString("0.00",culture)+" %",Num(replay,"combo")+"×",Num(replay,"miss").ToString(),Num(replay,"score").ToString("N0",culture)};
        int cell=Math.Min(104,Math.Max(64,(replayStats.Width-240)/4)), start=replayStats.Width-4*cell-14;
        const TextFormatFlags one=TextFormatFlags.SingleLine|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix;
        using(var title=UiFont(11.2f,FontStyle.Bold)) using(var sub=UiFont(8.6f)) {
            TextRenderer.DrawText(e.Graphics,TextOf(replay,"song"),title,new Rectangle(12,6,Math.Max(10,start-24),22),Ink,one);
            TextRenderer.DrawText(e.Graphics,"["+TextOf(replay,"diff")+"] · "+TextOf(replay,"player"),sub,new Rectangle(12,29,Math.Max(10,start-24),18),Muted,one);
        }
        using(var bold=UiFont(12f,FontStyle.Bold)) using(var small=UiFont(7.4f,FontStyle.Bold)) {
            for(int i=0;i<labels.Length;i++) {
                TextRenderer.DrawText(e.Graphics,values[i],bold,new Rectangle(start+i*cell,5,cell,22),Ink,TextFormatFlags.Right|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding);
                TextRenderer.DrawText(e.Graphics,labels[i],small,new Rectangle(start+i*cell,30,cell,15),Color.FromArgb(99,99,110),TextFormatFlags.Right|TextFormatFlags.NoPadding);
            }
        }
    }
    void SetEditing(bool active) {
        editing = active; mode.Text = active ? "Terminer le montage" : "Modifier la disposition";
        ((ThemedButton)mode).Selected = active;
        if (active) { playTimer.Stop(); play.Text = "▶"; ChangeScene(1); }
        preview.Invalidate();
    }
    async void ChangeScene(int index) {
        if (videosOpen) await ShowReplays();
        if (activeScene == index) return;
        activeScene = index;
        SelectSegment(sceneTabs,index);
        if (displayedScene != activeScene) {
            var previous = preview.Image;
            preview.Image = null;
            if (previous != null) previous.Dispose();
            preview.Invalidate();
        }
        await Run(RefreshPreview);
    }
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    static void ApplyDarkCaption(Form window) {
        int dark = 1;
        DwmSetWindowAttribute(window.Handle, 20, ref dark, sizeof(int));
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SendMessage(IntPtr window, int message, IntPtr flag, string value);
    static void Hint(TextBox field, string text) { SendMessage(field.Handle, 0x1501, IntPtr.Zero, text); }
    static GraphicsPath Round(Rectangle r, int radius) {
        var p = new GraphicsPath(); int d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
        if (d < 2) { p.AddRectangle(r); return p; }
        p.AddArc(r.X,r.Y,d,d,180,90); p.AddArc(r.Right-d,r.Y,d,d,270,90);
        p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90); p.AddArc(r.X,r.Bottom-d,d,d,90,90); p.CloseFigure();
        return p;
    }

    // Dark rounded select like the web version (the native ComboBox frame is painted over).
    sealed class WebCombo : ComboBox {
        protected override void WndProc(ref Message m) {
            base.WndProc(ref m);
            if (m.Msg != 0x000F || !IsHandleCreated) return;
            using (var g = Graphics.FromHwnd(Handle)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var back = new SolidBrush(Parent != null ? Parent.BackColor : Base)) g.FillRectangle(back, ClientRectangle);
                var r = new Rectangle(0, 0, Width - 1, Height - 1);
                using (var path = Round(r, 9)) {
                    using (var fill = new SolidBrush(Panel)) g.FillPath(fill, path);
                    using (var pen = new Pen(Focused || DroppedDown ? Accent : (ClientRectangle.Contains(PointToClient(MousePosition)) ? Color.FromArgb(58, 58, 68) : Line))) g.DrawPath(pen, path);
                }
                TextRenderer.DrawText(g, Text, Font, new Rectangle(11, 0, Width - 36, Height), Ink, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
                int cx = Width - 16, cy = Height / 2;
                using (var pen = new Pen(Muted, 1.6f)) g.DrawLines(pen, new[] { new Point(cx - 4, cy - 2), new Point(cx, cy + 2), new Point(cx + 4, cy - 2) });
            }
        }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); Invalidate(); }
    }
    // Rounded dark field around a borderless TextBox / NumericUpDown, pink focus ring, optional search icon.
    // Digits-only text field (replaces NumericUpDown, whose spin area paints white when themed).
    sealed class NumberBox : TextBox {
        public decimal Minimum, Maximum = 100;
        public decimal Value {
            get { decimal v; return decimal.TryParse(Text, NumberStyles.Number, CultureInfo.InvariantCulture, out v) ? Math.Max(Minimum, Math.Min(Maximum, v)) : Minimum; }
            set { Text = Math.Max(Minimum, Math.Min(Maximum, value)).ToString("0", CultureInfo.InvariantCulture); }
        }
        protected override void OnKeyPress(KeyPressEventArgs e) { if (!char.IsControl(e.KeyChar) && !char.IsDigit(e.KeyChar)) e.Handled = true; base.OnKeyPress(e); }
        protected override void OnMouseWheel(MouseEventArgs e) { Value = Value + (e.Delta > 0 ? 1 : -1); base.OnMouseWheel(e); }
        protected override void OnLeave(EventArgs e) { Value = Value; base.OnLeave(e); }
    }
    sealed class InputFrame : Panel {
        readonly Control inner; readonly bool icon;
        public InputFrame(Control control, bool searchIcon) {
            inner = control; icon = searchIcon; DoubleBuffered = true; Height = 36; Margin = new Padding(0, 4, 0, 4);
            Padding = new Padding(searchIcon ? 34 : 10, 10, 10, 6); BackColor = Base;
            control.Dock = DockStyle.Fill; control.BackColor = Panel; Controls.Add(control);
            control.GotFocus += (s, e) => Invalidate(); control.LostFocus += (s, e) => Invalidate();
            control.MouseEnter += (s, e) => Invalidate(); control.MouseLeave += (s, e) => Invalidate();
            Cursor = Cursors.IBeam; Click += (s, e) => inner.Focus();
        }
        protected override void OnPaint(PaintEventArgs e) {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            Control host = Parent; while (host != null && host.BackColor.A < 255) host = host.Parent;
            g.Clear(host != null ? host.BackColor : Base);
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            bool focus = inner.ContainsFocus, hover = ClientRectangle.Contains(PointToClient(MousePosition));
            using (var path = Round(r, 9)) {
                using (var fill = new SolidBrush(Panel)) g.FillPath(fill, path);
                using (var pen = new Pen(focus ? Accent : hover ? Color.FromArgb(58, 58, 68) : Line)) g.DrawPath(pen, path);
                if (focus) using (var glow = new Pen(Color.FromArgb(46, 255, 102, 171), 3)) g.DrawPath(glow, path);
            }
            if (icon) using (var pen = new Pen(Color.FromArgb(99, 99, 110), 1.8f)) { int cy = Height / 2; g.DrawEllipse(pen, 12, cy - 7, 11, 11); g.DrawLine(pen, 21, cy + 2, 25, cy + 6); }
        }
    }
    sealed class ThemedButton : Button {
        public bool Selected, Primary;
        public string Subtitle;
        public Color[] Swatches;
        public string Glyph;
        bool hover, pressed;
        float intensity, compression, hoverFrom, pressFrom;
        readonly Stopwatch gloss = new Stopwatch();
        readonly Stopwatch transition = new Stopwatch();
        readonly Timer animate = new Timer { Interval = 16 };
        public ThemedButton() {
            Cursor=Cursors.Hand;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true);
            animate.Tick += (s,e) => {
                var p=InterfaceEase(Math.Min(1,transition.Elapsed.TotalMilliseconds/150));
                intensity=hoverFrom+((hover?1:0)-hoverFrom)*p;
                compression=pressFrom+((pressed?1:0)-pressFrom)*p;
                if (p>=1) {
                    if(!Primary||!hover||gloss.ElapsedMilliseconds>=700)animate.Stop();
                }
                Invalidate();
            };
        }
        public override Size GetPreferredSize(Size proposedSize) {
            using(var bold=UiFont(Font.Size,FontStyle.Bold)) {
                var text=TextRenderer.MeasureText(Text,bold,Size.Empty,TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix);
                return new Size(text.Width+(Glyph!=null?44:30),Math.Max(33,text.Height+15));
            }
        }
        void Animate() { hoverFrom=intensity;pressFrom=compression;transition.Restart();animate.Start(); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; gloss.Restart(); Animate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = pressed = false; Animate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { pressed = e.Button==MouseButtons.Left; Animate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Animate(); base.OnMouseUp(e); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Parent == null ? Base : Parent.BackColor);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var segment=Parent as AnimatedSegment;
            if(segment!=null)segment.PaintThumb(e.Graphics,Location);
            var rect = Rectangle.Inflate(ClientRectangle, -1-(int)Math.Round(Width*.015*compression), -1-(int)Math.Round(Height*.015*compression));
            if (rect.Width < 2 || rect.Height < 2) return;
            var color = Primary ? Accent : Selected ? SoftAccent : Raised;
            int shine = Enabled ? (int)(intensity * 19) : 0;
            var shade = Color.FromArgb(Math.Min(255,color.R+shine),Math.Min(255,color.G+shine),Math.Min(255,color.B+shine));
            if(segment==null)using (var path = Round(rect, 9))
            using (var brush = new SolidBrush(Enabled ? shade : Panel))
            using (var border = new Pen(Selected || Focused && ShowFocusCues ? Accent : Line)) {
                e.Graphics.FillPath(brush, path); e.Graphics.DrawPath(border, path);
                if(Primary && Enabled && hover && gloss.ElapsedMilliseconds<700) {
                    var before=e.Graphics.Save();
                    e.Graphics.SetClip(path);
                    int glint=rect.X-48+(int)((rect.Width+96)*gloss.ElapsedMilliseconds/700);
                    using(var shineBrush=new LinearGradientBrush(new Rectangle(glint,rect.Y,48,rect.Height),Color.Transparent,Color.FromArgb(125,255,239,250),0f))
                        e.Graphics.FillRectangle(shineBrush,glint,rect.Y,48,rect.Height);
                    e.Graphics.Restore(before);
                }
            }
            var flags = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.NoPadding;
            if (Swatches != null) {
                for (int i=0; i<Swatches.Length; i++)
                    using (var mark = new SolidBrush(Swatches[i])) e.Graphics.FillRectangle(mark,rect.X+10+i*16,rect.Y+8,11,9);
                var headline = new Rectangle(rect.X+9,rect.Y+21,rect.Width-18,19);
                var hint = new Rectangle(rect.X+9,rect.Y+39,rect.Width-18,17);
                using (var strong = UiFont(Font.Size,FontStyle.Bold)) TextRenderer.DrawText(e.Graphics,Text,strong,headline,Ink,TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(e.Graphics,Subtitle ?? "",Font,hint,Muted,TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
                return;
            }
            var textColor=!Enabled||segment!=null&&!Selected&&intensity<.5f?Muted:Primary?Color.FromArgb(26,7,16):Ink;
            if(segment!=null&&segment.IsTabs&&Glyph!=null) {
                DrawGlyph(e.Graphics,Glyph,(Width-16)/2,5,Selected?Accent:textColor);
                using(var label=UiFont(8.5f,FontStyle.Bold))
                    TextRenderer.DrawText(e.Graphics,Text,label,new Rectangle(0,23,Width,16),textColor,flags);
                return;
            }
            using(var strong=UiFont(Font.Size,FontStyle.Bold)) {
                var textRect=Rectangle.Inflate(rect,-5,0);
                if(Glyph!=null) {
                    int width=TextRenderer.MeasureText(Text,strong).Width;
                    int start=Math.Max(rect.X+8,rect.X+(rect.Width-width-23)/2);
                    DrawGlyph(e.Graphics,Glyph,start,rect.Y+(rect.Height-16)/2,textColor);
                    textRect=new Rectangle(start+21,rect.Y,Math.Max(1,rect.Right-start-25),rect.Height);
                    flags=(flags & ~TextFormatFlags.HorizontalCenter)|TextFormatFlags.Left;
                }
                if(Glyph==null&&TextRenderer.MeasureText(Text,strong,Size.Empty,TextFormatFlags.SingleLine).Width>textRect.Width) {
                    using(var fitted=UiFont(Math.Max(8,Font.Size-1.3f),FontStyle.Bold))
                        TextRenderer.DrawText(e.Graphics,Text,fitted,textRect,textColor,flags);
                } else TextRenderer.DrawText(e.Graphics,Text,strong,textRect,textColor,flags);
            }
        }
        protected override void Dispose(bool disposing) { if (disposing) animate.Dispose(); base.Dispose(disposing); }
    }
    static void DrawGlyph(Graphics g,string name,int x,int y,Color color) {
        var state=g.Save();g.TranslateTransform(x,y);
        using(var p=new Pen(color,1.45f)) {
            p.StartCap=p.EndCap=LineCap.Round;p.LineJoin=LineJoin.Round;
            if(name=="film") {
                g.DrawRectangle(p,1,2,14,12);g.DrawLine(p,4,2,4,14);g.DrawLine(p,12,2,12,14);
                g.DrawLine(p,1,6,4,6);g.DrawLine(p,12,6,15,6);g.DrawLine(p,1,10,4,10);g.DrawLine(p,12,10,15,10);
            } else if(name=="eye") {
                using(var path=new GraphicsPath()) {path.AddBezier(0,8,5,1,11,1,16,8);path.AddBezier(16,8,11,15,5,15,0,8);g.DrawPath(p,path);}
                g.DrawEllipse(p,6,6,4,4);
            } else if(name=="layers") {
                g.DrawPolygon(p,new[]{new Point(8,1),new Point(15,5),new Point(8,9),new Point(1,5)});
                g.DrawLines(p,new[]{new Point(1,8),new Point(8,12),new Point(15,8)});
                g.DrawLines(p,new[]{new Point(1,11),new Point(8,15),new Point(15,11)});
            } else if(name=="sliders") {
                for(int i=0;i<3;i++){int a=3+i*5,b=i==1?10:5;g.DrawLine(p,a,1,a,b-1);g.DrawLine(p,a,b+2,a,15);g.DrawLine(p,a-2,b,a+2,b);}
            } else if(name=="download") {
                g.DrawLines(p,new[]{new Point(1,10),new Point(1,14),new Point(15,14),new Point(15,10)});
                g.DrawLine(p,8,1,8,10);g.DrawLines(p,new[]{new Point(5,7),new Point(8,10),new Point(11,7)});
            } else {
                g.DrawLine(p,8,3,8,13);g.DrawLine(p,3,8,13,8);
            }
        }
        g.Restore(state);
    }
    sealed class Scrubber : Control {
        double fraction;
        public string ClockText;
        public double Fraction { get { return fraction; } set { fraction=Math.Max(0,Math.Min(1,value));Invalidate(); } }
        public int Value { get { return (int)Math.Round(fraction*100); } set { Fraction=value/100.0; } }
        public Scrubber() {
            AccessibleName = "Position dans l’aperçu"; TabStop = true;
            SetStyle(ControlStyles.Selectable | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }
        protected override bool IsInputKey(Keys keyData) { return keyData == Keys.Left || keyData == Keys.Right || base.IsInputKey(keyData); }
        protected override void OnKeyDown(KeyEventArgs e) {
            if (e.KeyCode == Keys.Left || e.KeyCode == Keys.Right) { Value += e.KeyCode == Keys.Right ? 2 : -2; e.Handled = true; }
            base.OnKeyDown(e);
        }
        protected override void OnMouseDown(MouseEventArgs e) { Focus(); Capture = true; Slide(e.X); base.OnMouseDown(e); }
        protected override void OnMouseMove(MouseEventArgs e) { if (Capture) Slide(e.X); base.OnMouseMove(e); }
        protected override void OnMouseUp(MouseEventArgs e) { Capture = false; base.OnMouseUp(e); }
        int End { get { return Math.Max(9,Width-(ClockText==null?59:112)); } }
        void Slide(int x) { Fraction=(x-8)/(double)Math.Max(1,End-8); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Base); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            int y=Height/2, end=End, x=8+(int)Math.Round((end-8)*fraction);
            using (var rail=new Pen(Line,4)) e.Graphics.DrawLine(rail,8,y,end,y);
            using (var rail=new Pen(Accent,4)) e.Graphics.DrawLine(rail,8,y,x,y);
            using (var knob=new SolidBrush(Focused ? Accent : Ink)) e.Graphics.FillEllipse(knob,x-6,y-6,12,12);
            TextRenderer.DrawText(e.Graphics, ClockText ?? Value+" %", Font, new Rectangle(end+10,0,Width-end-10,Height), Muted, TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine);
        }
    }
    static NumberBox Number(int min, int max, int value) { return new NumberBox { Minimum = min, Maximum = max, Value = value, BackColor = Panel, ForeColor = Ink, BorderStyle = BorderStyle.None, TextAlign = HorizontalAlignment.Center }; }
    static Label TextLabel(string text) { return new Label { Text = text, AutoSize = true, ForeColor = Muted, UseMnemonic = false, Margin = new Padding(3, 8, 6, 3) }; }
    static FlowLayoutPanel Bar(params Control[] controls) {
        var p = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Top, WrapContents = true };
        p.Controls.AddRange(controls); return p;
    }
    static Control Column(Control fill, Control header, Control footer) {
        var panel = new Panel { Dock = DockStyle.Fill, BackColor = Base, Padding = new Padding(0, 0, 6, 0) };
        footer.Dock = DockStyle.Bottom;
        panel.Controls.Add(fill); panel.Controls.Add(header); panel.Controls.Add(footer);
        return panel;
    }
    Button Action(string caption, Func<Task> action) {
        var b = new ThemedButton { Text = caption, AutoSize = true, Height = 33, FlatStyle = FlatStyle.Flat, BackColor = Base, ForeColor = Ink, Padding = new Padding(9, 0, 9, 0) };
        if(caption.StartsWith("＋")) {b.Text="Ajouter un replay";b.Glyph="plus";}
        else if(caption=="Bibliothèque de widgets") b.Glyph="layers";
        else if(caption=="Configuration osu!"||caption=="Modifier la disposition") b.Glyph="sliders";
        else if(caption=="Exporter la vidéo") b.Glyph="film";
        else if(caption=="Tester 12 s") b.Glyph="eye";
        else if(caption=="Télécharger") b.Glyph="download";
        else if(caption.StartsWith("Ajouter")) b.Glyph="plus";
        if(b.Glyph!=null) b.Padding=new Padding(19,0,17,0);
        b.FlatAppearance.BorderSize = 0;
        b.Click += async (s, e) => await Run(action); return b;
    }
    async Task Run(Func<Task> action) {
        try { await action(); }
        catch (Exception e) { if (!IsDisposed) status.Text = e.Message; }
    }
    static object Field(Json row, string key) { object value; return row != null && row.TryGetValue(key, out value) ? value : null; }
    static string TextOf(Json row, string key) { return Convert.ToString(Field(row, key), CultureInfo.InvariantCulture) ?? ""; }
    static Json Map(Json row, string key) {
        var child = Field(row, key) as Json;
        if (child == null) row[key] = child = new Json();
        return child;
    }
    static Json[] Rows(object values) {
        var items = values as System.Collections.IEnumerable;
        return items == null ? new Json[0] : items.Cast<object>().OfType<Json>().ToArray();
    }
    static double Num(Json row, string key, double fallback = 0) {
        return Field(row, key) == null ? fallback : Convert.ToDouble(Field(row, key), CultureInfo.InvariantCulture);
    }
    static Json Selected(ListControl list) {
        var choice = (list is ListBox ? ((ListBox)list).SelectedItem : ((ComboBox)list).SelectedItem) as Item;
        return choice == null ? null : choice.Data;
    }
    sealed class Item {
        public readonly Json Data; readonly string label;
        public Item(Json data, string label) { Data = data; this.label = label; }
        public override string ToString() { return label; }
    }
    async Task<byte[]> Request(string path, object payload = null, byte[] file = null, string name = null) {
        using (var req = new HttpRequestMessage(payload == null && file == null ? HttpMethod.Get : HttpMethod.Post, path)) {
            if (token != null) req.Headers.Add("x-token", token);
            if (file != null) { req.Content = new ByteArrayContent(file); req.Headers.Add("x-name", Uri.EscapeDataString(name)); }
            else if (payload != null) req.Content = new StringContent(json.Serialize(payload), Encoding.UTF8, "application/json");
            using (var res = await http.SendAsync(req)) {
                var bytes = await res.Content.ReadAsByteArrayAsync();
                if (!res.IsSuccessStatusCode) {
                    var error = json.DeserializeObject(Encoding.UTF8.GetString(bytes)) as Json;
                    throw new InvalidOperationException(TextOf(error, "error"));
                }
                return bytes;
            }
        }
    }
    async Task<object> Api(string path, object payload = null) { return json.DeserializeObject(Encoding.UTF8.GetString(await Request(path, payload))); }
    static Process Launch(string file, string args, string cwd) {
        return Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = cwd });
    }
    async Task Start() {
        status.Text = "Chargement de Dancing!…";
        int port;
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start(); port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "server.mjs") {
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root
        };
        token = Guid.NewGuid().ToString("N");
        info.EnvironmentVariables["PORT"] = port.ToString(CultureInfo.InvariantCulture);
        info.EnvironmentVariables["DANCING_NATIVE_TOKEN"] = token;
        worker = Process.Start(info);
        http.BaseAddress = new Uri("http://127.0.0.1:" + port);
        for (var attempt = 0; ; attempt++) {
            try { await Api("/api/job"); break; }
            catch (HttpRequestException) { if (attempt == 35 || worker.HasExited) throw new InvalidOperationException("Le moteur de rendu n’a pas démarré."); }
            await Task.Delay(150);
        }
        library = (Json)await Api("/api/native/library");
        await RefreshState();
        if (!Convert.ToBoolean(Field(app, "setupComplete"))) await Configure();
        status.Text = "Prêt";
        await RefreshPreview();
    }
    async Task RefreshState(string replayId = null) {
        replayId = replayId ?? TextOf(Selected(replays), "id");
        state = (Json)await Api("/api/state"); token = TextOf(state, "token"); app = Map(state, "app");
        widgets = Rows(Field(app, "tosu")).Cast<object>().ToList(); app["tosu"] = widgets;
        FillReplays(replayId); FillPresets(); FillWidgets();
        var defaults = Map(Map(state, "danserDefaults"), "Recording");
        var recording = Map(Map(app, "danser"), "Recording");
        var size = Num(recording, "FrameWidth", Num(defaults, "FrameWidth")) + "x" + Num(recording, "FrameHeight", Num(defaults, "FrameHeight"));
        resolution.SelectedItem = size;
        fps.SelectedItem = Num(recording, "FPS", Num(defaults, "FPS")).ToString(CultureInfo.InvariantCulture);
        encoder.SelectedItem = Field(recording,"Encoder") ?? Field(defaults,"Encoder");
        var blur = Field(recording,"MotionBlur") as Json ?? Field(defaults,"MotionBlur") as Json;
        var useBlur = Field(blur,"Enabled") ?? Field(Field(defaults,"MotionBlur") as Json,"Enabled");
        double samples = Num(blur,"OversampleMultiplier",Num(Field(defaults,"MotionBlur") as Json,"OversampleMultiplier",4));
        blurChoice = !Convert.ToBoolean(useBlur) ? 0 : samples <= 5 ? 1 : samples <= 10 ? 2 : 3;
        blurChanged = false; SelectSegment(blurButtons,blurChoice);
        var audio = Field(Map(app,"danser"),"Audio") as Json;
        var audioDefaults = Field(Map(state,"danserDefaults"),"Audio") as Json;
        music.Value = music.Clamp(100 * Num(audio,"MusicVolume",Num(audioDefaults,"MusicVolume",.5)));
        effects.Value = effects.Clamp(100 * Num(audio,"SampleVolume",Num(audioDefaults,"SampleVolume",.5)));
        var background = Field(Field(Map(app,"danser"),"Playfield") as Json,"Background") as Json;
        dim.Value = dim.Clamp(100 * Num(Field(background,"Dim") as Json,"Normal",.92));
        clipStart.Value = Bound(clipStart,Num(Map(app,"render"),"clipStart"));
        clipEnd.Value = Bound(clipEnd,Num(Map(app,"render"),"clipEnd"));
        skin.Items.Clear();
        foreach (var name in (object[])state["skins"]) skin.Items.Add(name);
        var skinName = TextOf(Map(Map(app, "danser"), "Skin"), "CurrentSkin");
        if (string.IsNullOrEmpty(skinName)) skinName = TextOf(Field(Field(state, "danserDefaults") as Json, "Skin") as Json, "CurrentSkin");
        skin.SelectedItem = skinName;
        intro.Checked = Convert.ToBoolean(Field(Map(app, "scenes"), "intro"));
        outro.Checked = Convert.ToBoolean(Field(Map(app, "scenes"), "outro"));
    }
    void FillReplays(string selection = null) {
        if (state == null) return;
        selection = selection ?? TextOf(Selected(replays), "id");
        replays.BeginUpdate(); replays.Items.Clear();
        foreach (var r in Rows(Field(state, "replays"))) {
            var title = TextOf(r, "song") + "  ·  " + TextOf(r, "player");
            if (title.IndexOf(search.Text, StringComparison.CurrentCultureIgnoreCase) < 0) continue;
            replays.Items.Add(new Item(r, title));
            if (TextOf(r, "id") == selection) replays.SelectedIndex = replays.Items.Count - 1;
        }
        if (replays.SelectedIndex < 0 && replays.Items.Count > 0) replays.SelectedIndex = 0;
        replays.EndUpdate(); SetButtons();
    }
    void FillPresets() {
        preset.Items.Clear();
        foreach (Control old in presetCards.Controls.Cast<Control>().ToArray()) old.Dispose();
        foreach (var p in Rows(Field(library, "presets")).Concat(Rows(Field(state, "userPresets")))) {
            var item = new Item(p, TextOf(p, "name"));
            preset.Items.Add(item);
            if (TextOf(p, "id") == TextOf(app, "preset")) preset.SelectedIndex = preset.Items.Count - 1;
            var card = (ThemedButton)Action(TextOf(p, "name"), async () => { preset.SelectedItem = item; await ApplyPreset(); });
            card.AutoSize = false; card.Width = Math.Max(80,presetCards.ClientSize.Width / 2 - 7); card.Height = 60;
            card.Subtitle = TextOf(p,"desc");
            var hud = Field(p,"hud") as Json;
            card.Swatches = new[] { Accent, Color.FromArgb(95,84,138), Color.FromArgb(74,151,135), Color.FromArgb(192,121,152) };
            if (hud != null) {
                var keys = new[] { "tubeColor", "hpColor", "keyColor", "panelColor" };
                for (int i=0;i<keys.Length;i++) if (TextOf(hud,keys[i]).StartsWith("#"))
                    try { card.Swatches[i] = ColorTranslator.FromHtml(TextOf(hud,keys[i])); } catch (ArgumentException) { }
            }
            card.Selected = TextOf(p, "id") == TextOf(app, "preset");
            presetCards.Controls.Add(card);
        }
        if (preset.SelectedIndex < 0) {
            preset.Items.Insert(0, "Composition actuelle");
            preset.SelectedIndex = 0;
        }
    }
    void FillWidgets(int index = -1) {
        placed.Items.Clear();
        foreach (var w in widgets.Cast<Json>()) placed.Items.Add(new Item(w, TextOf(w, "name")));
        placed.SelectedIndex = index >= 0 && index < widgets.Count ? index : -1;
        UpdateSelection();
    }
    async Task ApplyPreset() {
        var p = Selected(preset); if (p == null) return;
        var hud = json.Deserialize<Json>(json.Serialize(Field(p, "hud")));
        foreach (var key in new[] { "countryRank", "globalRank", "country", "avatarPath", "showFlag" }) {
            var value = Field(Map(app, "hud"), key); if (value != null) hud[key] = value;
        }
        app["hud"] = hud; app["preset"] = TextOf(p, "id");
        widgets = Rows(json.DeserializeObject(json.Serialize(Field(p, "tosu")))).Cast<object>().ToList();
        app["tosu"] = widgets; FillWidgets();
        FillPresets();
        await SaveAndPreview();
    }
    async Task SavePreset() {
        if (app == null) return;
        using (var dialog = Dialog("Enregistrer le preset", 380, 160)) {
            var name = new TextBox { Dock = DockStyle.Top, Text = "Mon preset" };
            dialog.Controls.Add(name);
            var save = new Button { Text = "Enregistrer", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
            dialog.Controls.Add(save); dialog.AcceptButton = save;
            if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(name.Text)) return;
            var custom = Rows(Field(state, "userPresets")).Cast<object>().ToList();
            var id = "u" + Guid.NewGuid().ToString("N");
            custom.Add(new Json { { "id", id }, { "name", name.Text.Trim() }, { "hud", app["hud"] }, { "tosu", widgets } });
            await Api("/api/presets", custom);
            state["userPresets"] = json.DeserializeObject(json.Serialize(custom)); app["preset"] = id;
            FillPresets(); await SaveSettings();
        }
    }
    async Task RemoveWidget() {
        int index = placed.SelectedIndex;
        if (index < 0 || index >= widgets.Count) return;
        widgets.RemoveAt(index); FillWidgets(Math.Min(index, widgets.Count - 1));
        await SaveAndPreview();
    }
    void UpdateSelection() {
        var w = Selected(placed); updating = true;
        scale.Enabled = opacity.Enabled = removeWidget.Enabled = w != null;
        scale.Value = scale.Clamp(Num(w, "s", 1) * 100);
        opacity.Value = opacity.Clamp(Num(w, "o", 1) * 100);
        updating = false; preview.Invalidate();
    }
    static decimal Bound(NumberBox control, double value) { return Math.Max(control.Minimum, Math.Min(control.Maximum, (decimal)value)); }
    async Task ChangeWidget(string field, double value) {
        if (updating) return;
        var w = Selected(placed); if (w == null) return;
        w[field] = value; preview.Invalidate(); await Run(SaveAndPreview);
    }
    RectangleF ImageRect() {
        var ratio = Math.Min(preview.Width / 1920f, preview.Height / 1080f);
        return new RectangleF((preview.Width - 1920 * ratio) / 2, (preview.Height - 1080 * ratio) / 2, 1920 * ratio, 1080 * ratio);
    }
    PointF CanvasPoint(Point point) {
        var rect = ImageRect();
        return new PointF((point.X - rect.X) * 1920 / rect.Width, (point.Y - rect.Y) * 1080 / rect.Height);
    }
    static RectangleF WidgetRect(Json w) {
        var s = Num(w, "s", 1);
        return new RectangleF((float)Num(w, "x"), (float)Num(w, "y"), (float)(Num(w, "w") * s), (float)(Num(w, "h") * s));
    }
    void DrawSelection(object sender, PaintEventArgs e) {
        var area = Rectangle.Round(ImageRect());
        if (area.Width > 3 && area.Height > 3) {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var outline = Round(Rectangle.Inflate(area,-1,-1), 11))
            using (var border = new Pen(editing || rendering ? Accent : Line)) e.Graphics.DrawPath(border,outline);
        }
        if (preview.Image == null) {
            TextRenderer.DrawText(e.Graphics,"Préparation de l’aperçu…",Font,area,Muted,TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            return;
        }
        var w = Selected(placed); if (w == null || activeScene != 1) return;
        var image = ImageRect(); var rect = WidgetRect(w); var s = image.Width / 1920;
        using (var pen = new Pen(Accent, 2)) e.Graphics.DrawRectangle(pen, image.X + rect.X * s, image.Y + rect.Y * s, rect.Width * s, rect.Height * s);
    }
    void PickWidget(object sender, MouseEventArgs e) {
        if (activeScene != 1 || e.Button != MouseButtons.Left && e.Button != MouseButtons.Right) return;
        var point = CanvasPoint(e.Location);
        int index = widgets.FindLastIndex(value => WidgetRect((Json)value).Contains(point));
        placed.SelectedIndex = index;
        if (index < 0 || e.Button != MouseButtons.Left) return;
        dragOrigin = point; dragged = (Json)widgets[index]; preview.Capture = true;
        originalX = Num(dragged, "x"); originalY = Num(dragged, "y");
    }
    void MoveWidget(object sender, MouseEventArgs e) {
        if (dragged == null) return;
        var point = CanvasPoint(e.Location); var size = WidgetRect(dragged);
        dragged["x"] = Math.Round(Math.Max(0, Math.Min(1920 - size.Width, originalX + point.X - dragOrigin.X)));
        dragged["y"] = Math.Round(Math.Max(0, Math.Min(1080 - size.Height, originalY + point.Y - dragOrigin.Y)));
        preview.Invalidate();
    }
    async Task SaveAndPreview() {
        await SaveSettings(); await RefreshPreview();
    }
    Task SaveSettings() {
        var snapshot = json.DeserializeObject(json.Serialize(app));
        var previous = settingsWrite;
        settingsWrite = WriteAfter(previous, snapshot);
        return settingsWrite;
    }
    async Task WriteAfter(Task previous, object snapshot) {
        try { await previous; } catch { }
        await Api("/api/settings", snapshot);
    }
    async Task RefreshPreview() {
        if (app == null || IsDisposed || videosOpen) return;
        if (loadingPreview) { previewPending = true; return; }
        loadingPreview = true;
        try {
            do {
                previewPending = false;
                int requestedScene = activeScene;
                var name = new[] { "intro", "game", "outro" }[requestedScene];
                var bytes = await Request("/api/native/preview?scene=" + name + "&position=" + (position.Value / 100.0).ToString(CultureInfo.InvariantCulture));
                if (!IsDisposed && !videosOpen && requestedScene == activeScene) {
                    SetImage(preview, bytes);
                    displayedScene = requestedScene;
                }
            } while (previewPending && !IsDisposed && !videosOpen);
        } finally { loadingPreview = false; }
    }
    static void SetImage(PictureBox target, byte[] bytes) {
        var previous = target.Image;
        using (var stream = new MemoryStream(bytes))
        using (var decoded = Image.FromStream(stream)) target.Image = new Bitmap(decoded);
        if (previous != null) previous.Dispose();
    }
    static Form Dialog(string title, int width, int height) {
        var dialog = new Form { Text = title, Width = width, Height = height, StartPosition = FormStartPosition.CenterParent, BackColor = Base, ForeColor = Ink, Font = UiFont(10), ShowInTaskbar = false, MinimizeBox = false };
        dialog.Shown += (s,e) => {
            ApplyDarkCaption(dialog);
            if(!SystemInformation.IsMenuAnimationEnabled)return;
            var elapsed=Stopwatch.StartNew();
            var fade=new Timer { Interval=16 };
            dialog.Opacity=.35;
            fade.Tick+=(a,b)=>{
                var t=Math.Min(1,elapsed.Elapsed.TotalMilliseconds/180);
                dialog.Opacity=1-.65*Math.Pow(1-t,3);
                if(t>=1)fade.Stop();
            };
            dialog.FormClosed+=(a,b)=>fade.Dispose();
            fade.Start();
        };
        return dialog;
    }
    async Task ShowVideos() {
        if (state == null) return;
        if (!videosOpen) {
            previewPosition=position.Value;
            playTimer.Stop(); play.Text="▶";
            videosOpen=true; replayPane.Visible=false; videoPane.Visible=true;
            preview.Visible=false; mode.Enabled=false;
            SelectSegment(leftTabs,1);
            replayTitle.Text="Vidéos exportées";
            previewTag.Text="Lecteur vidéo";
            position.ClockText="0:00 / 0:00"; position.Value=0;
            stageSurface.Invalidate();
        }
        var current = Rows(await Api("/api/videos"));
        if (!videosOpen) return;
        var selected = videoFile ?? TextOf(Selected(videos),"name");
        videos.BeginUpdate();
        videos.Items.Clear();
        foreach(var row in current) {
            var name=TextOf(row,"name");
            videos.Items.Add(new Item(row,name));
            if(name==selected)videos.SelectedIndex=videos.Items.Count-1;
        }
        if(videos.SelectedIndex<0&&videos.Items.Count>0)videos.SelectedIndex=0;
        videos.EndUpdate();
        if(videoFile==null)status.Text=videos.Items.Count==0 ? "Tes vidéos rendues apparaîtront ici." : "Sélectionne une vidéo, puis appuie sur Lecture.";
    }
    int previewPosition;
    string montageTag="Démonstration";
    async Task ShowReplays() {
        if (!videosOpen) return;
        CloseVideo();
        videosOpen=false;
        replayPane.Visible=true; videoPane.Visible=false;
        preview.Visible=true; mode.Enabled=true;
        SelectSegment(leftTabs,0);
        position.ClockText=null; position.Value=previewPosition;
        previewTag.Text=montageTag; UpdateReplaySummary();
        if(preview.Image==null) await RefreshPreview();
    }
    Task TogglePlayback() {
        if(videosOpen) {
            var name=TextOf(Selected(videos),"name");
            if(videoFile==null || name.Length>0&&name!=videoFile) return OpenVideo(name);
            if(mediaPlaying) {media.Pause();mediaPlaying=false;}
            else {
                if(media.NaturalDuration.HasTimeSpan&&media.Position>=media.NaturalDuration.TimeSpan)media.Position=TimeSpan.Zero;
                media.Play();mediaPlaying=true;
            }
            play.Text=mediaPlaying?"Ⅱ":"▶";
            return Task.CompletedTask;
        }
        playTimer.Enabled=!playTimer.Enabled; play.Text=playTimer.Enabled?"Ⅱ":"▶";
        return Task.CompletedTask;
    }
    async Task OpenLatestVideo() {
        if(string.IsNullOrEmpty(latestVideo))return;
        await ShowVideos();
        for(int i=0;i<videos.Items.Count;i++) {
            if(TextOf(((Item)videos.Items[i]).Data,"name")==latestVideo){videos.SelectedIndex=i;break;}
        }
        await OpenVideo(latestVideo);
    }
    Task OpenVideo(string name) {
        if(name.Length==0)return Task.CompletedTask;
        var file=Path.Combine(TextOf(Map(app,"paths"),"output"),Path.GetFileName(name));
        if(!File.Exists(file)) throw new FileNotFoundException("La vidéo a été déplacée ou supprimée.",file);
        if(media==null) {
            media=new MediaElement { LoadedBehavior=MediaState.Manual, UnloadedBehavior=MediaState.Close, Stretch=System.Windows.Media.Stretch.Uniform, Volume=.8 };
            mediaHost=new ElementHost { Child=media,Dock=DockStyle.Fill,BackColor=Color.Black,Margin=new Padding(0) };
            stageSurface.Controls.Add(mediaHost);
            media.MediaOpened+=(s,e)=>{if(videoFile==null)return;status.Text="Lecture locale · "+videoFile;UpdateMediaPosition();};
            media.MediaEnded+=(s,e)=>{mediaPlaying=false;play.Text="▶";UpdateMediaPosition();};
            media.MediaFailed+=(s,e)=>{
                if(videoFile==null)return;
                mediaTimer.Stop();mediaPlaying=false;play.Text="▶";
                status.Text="Windows ne peut pas décoder ce fichier. Utilise H.264 pour un export compatible.";
                videoFile=null;
            };
        }
        media.Close(); videoFile=name;
        mediaHost.Visible=true; mediaHost.BringToFront();
        replayTitle.Text=name;
        status.Text="Ouverture de la vidéo…";
        media.Source=new Uri(file,UriKind.Absolute);
        media.Play(); mediaPlaying=true; play.Text="Ⅱ";
        position.Value=0; mediaTimer.Start();
        return Task.CompletedTask;
    }
    void CloseVideo() {
        videoFile=null; mediaPlaying=false; mediaTimer.Stop();
        if(media!=null){media.Close();media.Source=null;mediaHost.Visible=false;}
        play.Text="▶";
    }
    Task SeekPlayback() {
        if(!videosOpen)return RefreshPreview();
        if(videoFile!=null&&media.NaturalDuration.HasTimeSpan) {
            media.Position=TimeSpan.FromTicks((long)(media.NaturalDuration.TimeSpan.Ticks*position.Fraction));
            UpdateMediaPosition();
        }
        return Task.CompletedTask;
    }
    static string MediaClock(TimeSpan t) {
        return ((int)t.TotalMinutes).ToString(CultureInfo.InvariantCulture)+":"+t.Seconds.ToString("00",CultureInfo.InvariantCulture);
    }
    void UpdateMediaPosition() {
        if(videoFile==null||!media.NaturalDuration.HasTimeSpan||position.Capture)return;
        var duration=media.NaturalDuration.TimeSpan; var time=media.Position;
        position.ClockText=MediaClock(time)+" / "+MediaClock(duration);
        position.Fraction=time.TotalMilliseconds/Math.Max(1,duration.TotalMilliseconds);
    }
    Task ShowLibrary() {
        if (library == null) return Task.CompletedTask;
        using (var dialog = Dialog("Bibliothèque de widgets", 985, 650)) {
            var query = new TextBox { BackColor = Panel, ForeColor = Ink, BorderStyle = BorderStyle.None, AccessibleName = "Rechercher un widget" };
            var notice = new Label { Dock = DockStyle.Bottom, Height = 26, ForeColor = Muted, TextAlign = ContentAlignment.MiddleLeft };
            var grid = new FlowLayoutPanel { WrapContents = true, Padding = new Padding(12, 8, 4, 10) };
            var scroll = new ScrollFrame(grid, width => {
                const int tileWidth=226, tileHeight=183;
                int columns=Math.Max(1,(width-grid.Padding.Horizontal)/tileWidth);
                return grid.Padding.Vertical+(grid.Controls.Count+columns-1)/columns*tileHeight;
            });
            var tiles = new List<Tuple<PictureBox, Json>>();
            var installed = Rows(Field(state, "tosuInstalled"))
                .Where(w => TextOf(w,"folder") != "Replay HUD - Précision").ToList();
            Json[] catalog = null;
            int view = 0;
            bool fetching = false;
            Func<Json, Json> findLocal = w => installed.FirstOrDefault(x => TextOf(x,"folder") == TextOf(w,"folder"));
            System.Action loadVisible = () => {
                if (!grid.Visible) return;
                foreach (var tile in tiles) {
                    var image = tile.Item1; var card = image.Parent;
                    if (image.Tag != null || card.Bottom < scroll.Offset || card.Top > scroll.Offset + scroll.Page + 170) continue;
                    image.Tag = true;
                    LoadThumbnail(image, tile.Item2);
                }
            };
            System.Action fill = () => {
                grid.SuspendLayout();
                foreach (Control old in grid.Controls.Cast<Control>().ToArray()) {
                    var cover = old.Controls.OfType<PictureBox>().FirstOrDefault();
                    if (cover != null && cover.Image != null) cover.Image.Dispose();
                    old.Dispose();
                }
                tiles.Clear();
                var rows = view == 0 ? catalog ?? new Json[0] : installed.ToArray();
                foreach (var w in rows) {
                    if ((TextOf(w,"name") + " " + TextOf(w,"author")).IndexOf(query.Text,StringComparison.CurrentCultureIgnoreCase) < 0) continue;
                    var card = new Panel { Width = 214, Height = 171, BackColor = Panel, Margin = new Padding(4,4,8,8), Padding = new Padding(1) };
                    using(var mask=Round(new Rectangle(0,0,card.Width,card.Height),11)) card.Region=new Region(mask);
                    card.Paint += (s,e) => {
                        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                        using (var border = new Pen(Line)) using (var path = Round(Rectangle.Inflate(card.ClientRectangle,-1,-1),10)) e.Graphics.DrawPath(border,path);
                    };
                    var image = new PictureBox { Dock = DockStyle.Top, Height = 90, BackColor = Color.FromArgb(37,46,59), SizeMode = PictureBoxSizeMode.Zoom };
                    image.Paint += (s,e) => {
                        if(image.Image==null) {
                            e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
                            DrawGlyph(e.Graphics,"layers",(image.Width-16)/2,(image.Height-16)/2,Muted);
                        }
                    };
                    var title = new Label { Dock = DockStyle.Top, Height = 22, ForeColor = Ink, Text = TextOf(w,"name"), AutoEllipsis = true, Padding = new Padding(10,4,6,0) };
                    var author = new Label { Dock = DockStyle.Top, Height = 18, ForeColor = Muted, Text = TextOf(w,"author"), AutoEllipsis = true, Padding = new Padding(10,0,6,0) };
                    bool needsDownload = view == 0 && findLocal(w) == null;
                    Button button = null;
                    button = Action(needsDownload ? "Installer" : "Ajouter", async () => {
                        if (view == 1 || findLocal(w) != null) {
                            var widget = view == 0 ? findLocal(w) : w;
                            dialog.Close();
                            await AddWidget(widget);
                            return;
                        }
                        button.Enabled = false; button.Text = "Installation…";
                        try {
                            var asset = (Json)await Api("/api/tosu/install", new Json { {"id",w["id"]} });
                            asset["id"] = w["id"];
                            installed.Add(asset); state["tosuInstalled"] = installed;
                            if (!button.IsDisposed) {
                                button.Text = "Ajouter";
                                ((ThemedButton)button).Glyph="plus"; ((ThemedButton)button).Primary = true; button.Invalidate();
                                notice.Text = TextOf(w,"name") + " téléchargé";
                            }
                        } catch (Exception ex) { if (!button.IsDisposed) { button.Text = "Réessayer"; notice.Text = "Échec de l’installation : " + ex.Message; } }
                        finally { if (!button.IsDisposed) button.Enabled = true; }
                    });
                    var foot = new Panel { Dock = DockStyle.Bottom, Height = 46, Padding = new Padding(10,4,10,9), BackColor = Panel };
                    button.AutoSize = false; button.Dock = DockStyle.Fill; ((ThemedButton)button).Primary = !needsDownload;
                    foot.Controls.Add(button);
                    card.Controls.Add(foot); card.Controls.Add(author); card.Controls.Add(title); card.Controls.Add(image);
                    grid.Controls.Add(card); tiles.Add(Tuple.Create(image,w));
                }
                grid.ResumeLayout(true);
                scroll.ScrollTo(0); scroll.UpdateContent();
                if (grid.Controls.Count == 0 && (view != 0 || catalog != null)) notice.Text = "Aucun widget dans cette vue.";
                loadVisible();
            };
            Func<Task> fetchCatalog = async () => {
                if (catalog != null || fetching) return;
                fetching = true; notice.Text = "Chargement du catalogue…";
                try {
                    catalog = Rows(await Api("/api/tosu/catalog"));
                    foreach (var local in installed) {
                        var match = catalog.FirstOrDefault(w => TextOf(w,"folder") == TextOf(local,"folder"));
                        if (match != null) local["id"] = Field(match,"id");
                    }
                }
                catch (Exception ex) { if (!dialog.IsDisposed) notice.Text = ex.Message; }
                finally {
                    fetching = false;
                    if (!dialog.IsDisposed && catalog != null) { notice.Text = ""; fill(); }
                }
            };
            var filters = Segment(new[] { "Catalogue communautaire", "Téléchargés" }, 0, async i => {
                view = i; notice.Text = ""; fill();
                if (i == 0) await fetchCatalog();
            });
            filters.Dock = DockStyle.Top; filters.Height = 40;
            var header = new Panel { Dock = DockStyle.Top, Height = 82, Padding = new Padding(15,7,15,6) };
            var queryFrame = new InputFrame(query, true) { Dock = DockStyle.Bottom };
            header.Controls.Add(queryFrame); header.Controls.Add(filters);
            query.TextChanged += (s,e) => fill();
            scroll.Scrolled += (s,e) => loadVisible();
            dialog.Controls.Add(scroll); dialog.Controls.Add(notice); dialog.Controls.Add(header);
            dialog.Shown += async (s,e) => { Hint(query,"Rechercher un widget…"); await fetchCatalog(); };
            dialog.FormClosed += (s,e) => {
                foreach (var tile in tiles) if (tile.Item1.Image != null) tile.Item1.Image.Dispose();
            };
            fill(); dialog.ShowDialog(this);
        }
        return Task.CompletedTask;
    }
    async void LoadThumbnail(PictureBox target, Json widget) {
        try {
            var id=TextOf(widget,"id");
            if (id.Length==0) return;
            var bytes = await Request("/api/tosu/thumbnail?id="+Uri.EscapeDataString(id));
            if (!target.IsDisposed) SetImage(target, bytes);
        } catch { }
    }
    async Task AddWidget(Json widget) {
        var width = Math.Max(2, Num(widget,"w",600)); var height = Math.Max(2, Num(widget,"h",200));
        var s = Math.Min(1,Math.Min(1856/width,1016/height));
        var placement = new Json { {"folder",widget["folder"]},{"name",widget["name"]},{"w",width},{"h",height},{"s",s},{"o",1},{"x",32},{"y",32} };
        for (int y = 32; y + height * s <= 1048; y += 24) {
            placement["y"] = y;
            if (!widgets.Cast<Json>().Any(v => WidgetRect(v).IntersectsWith(WidgetRect(placement)))) break;
        }
        widgets.Add(placement); FillWidgets(widgets.Count-1);
        SetEditing(true); ((Button)inspectorTabs.Controls[1]).PerformClick();
        await SaveAndPreview();
    }


    Task Configure() {
        if (state == null) return Task.CompletedTask;
        using (var dialog = Dialog(!Convert.ToBoolean(Field(app, "setupComplete")) ? "Bienvenue dans Dancing!" : "Configuration osu!", 650, 310)) {
            var inputs = new Dictionary<string, TextBox>();
            var detected = Map(state, "osuDetected"); var general = Map(Map(app, "danser"), "General");
            var fields = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(12) };
            foreach (var item in new[] { Tuple.Create("Songs", "Beatmaps"), Tuple.Create("Skins", "Skins"), Tuple.Create("Replays", "Replays") }) {
                var value = TextOf(general, "Osu" + item.Item1 + "Dir");
                var input = new TextBox { Width = 430, Text = string.IsNullOrEmpty(value) ? TextOf(detected, item.Item1) : value };
                inputs[item.Item1] = input;
                fields.Controls.Add(TextLabel(item.Item2));
                fields.Controls.Add(Bar(input, Action("Parcourir…", () => {
                    using (var picker = new FolderBrowserDialog { SelectedPath = input.Text, ShowNewFolderButton = false })
                        if (picker.ShowDialog(dialog) == DialogResult.OK) input.Text = picker.SelectedPath;
                    return Task.CompletedTask;
                })));
            }
            var choose = Picker(); choose.Items.AddRange(Resolutions);
            choose.SelectedItem = resolution.SelectedItem;
            fields.Controls.Add(Bar(TextLabel("Résolution vidéo"), choose));
            var error = TextLabel("");
            var finish = Action("Enregistrer", async () => {
                try {
                    try { await settingsWrite; } catch { }
                    await Api("/api/setup", new Json { {"dirs",inputs.ToDictionary(k=>k.Key,v=>v.Value.Text.Trim())},{"resolution",choose.Text} });
                    await RefreshState(); dialog.Close(); await RefreshPreview();
                } catch (Exception ex) { error.Text = ex.Message; }
            });
            fields.Controls.Add(Bar(finish, error)); dialog.Controls.Add(fields); dialog.ShowDialog(this);
        }
        return Task.CompletedTask;
    }
    Task ChooseColors() {
        if (app == null) return Task.CompletedTask;
        using (var dialog = Dialog("Couleurs du HUD", 450, 260)) {
            var rows = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14) };
            var hud = Map(app,"hud");
            foreach (var pair in new[] { Tuple.Create("Accent", "accent"), Tuple.Create("Barre de vie", "hpColor"), Tuple.Create("Touches", "keyColor"), Tuple.Create("Panneaux", "panelColor") }) {
                var button = Action(pair.Item1, async () => {
                    Color current = Accent;
                    try { current = ColorTranslator.FromHtml(TextOf(hud,pair.Item2)); } catch (ArgumentException) { }
                    using (var picker = new ColorDialog { Color = current, FullOpen = true }) {
                        if (picker.ShowDialog(dialog) != DialogResult.OK) return;
                        hud[pair.Item2] = ColorTranslator.ToHtml(picker.Color);
                    }
                    await SaveAndPreview();
                });
                rows.Controls.Add(button);
            }
            dialog.Controls.Add(rows); dialog.ShowDialog(this);
        }
        return Task.CompletedTask;
    }
    Task ConfigureAccount() {
        if (app == null) return Task.CompletedTask;
        using (var dialog = Dialog("Compte osu!", 475, 280)) {
            var rows = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(15) };
            var id = new TextBox { Width = 360, BackColor = Panel, ForeColor = Ink, AccessibleName = "Identifiant client" };
            var secret = new TextBox { Width = 360, BackColor = Panel, ForeColor = Ink, UseSystemPasswordChar = true, AccessibleName = "Clé secrète" };
            var message = TextLabel(Convert.ToBoolean(Field(Field(state,"account") as Json,"configured")) ? "Compte configuré." : "Saisis les identifiants d’une application OAuth osu!.");
            rows.Controls.Add(message); rows.Controls.Add(TextLabel("ID client")); rows.Controls.Add(id);
            rows.Controls.Add(TextLabel("Clé secrète")); rows.Controls.Add(secret);
            rows.Controls.Add(Action("Connecter", async () => {
                try {
                    await Api("/api/osu-auth", new Json { {"id",id.Text.Trim()},{"secret",secret.Text.Trim()} });
                    secret.Clear(); message.Text = "Compte connecté.";
                } catch (Exception ex) { message.Text = ex.Message; }
            }));
            dialog.Controls.Add(rows); dialog.ShowDialog(this);
        }
        return Task.CompletedTask;
    }
    static string ReplayDrop(IDataObject data) {
        var paths = data.GetData(DataFormats.FileDrop) as string[];
        return paths == null ? null : paths.FirstOrDefault(p => p.EndsWith(".osr",StringComparison.OrdinalIgnoreCase));
    }
    async Task ImportReplay() {
        if (state == null) return;
        using (var dialog = new OpenFileDialog { Filter = "Replay osu! (*.osr)|*.osr" }) {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            await ImportReplay(dialog.FileName);
        }
    }
    async Task ImportReplay(string file) {
        if (state == null) return;
        if (new FileInfo(file).Length > 20000000) throw new InvalidOperationException("Replay trop volumineux.");
        var data = await Request("/api/upload", null, File.ReadAllBytes(file), Path.GetFileName(file));
        await RefreshState(TextOf(json.Deserialize<Json>(Encoding.UTF8.GetString(data)), "id"));
    }
    async Task StartRender(string mode) {
        var replay = Selected(replays); if (replay == null || rendering) return;
        rendering = true; SetButtons();
        try {
            var danser = Map(app, "danser"); var recording = Map(danser, "Recording");
            if (resolution.SelectedIndex >= 0) {
                var size = resolution.Text.Split('x').Select(int.Parse).ToArray();
                recording["FrameWidth"] = size[0]; recording["FrameHeight"] = size[1];
            }
            if (fps.SelectedIndex >= 0) recording["FPS"] = int.Parse(fps.Text);
            if (encoder.SelectedIndex >= 0) recording["Encoder"] = encoder.Text;
            if (blurChanged) {
                var blur = Map(recording,"MotionBlur"); blur["Enabled"] = blurChoice != 0;
                if (blurChoice > 0) {
                    blur["OversampleMultiplier"] = new[] { 0, 4, 8, 14 }[blurChoice];
                    blur["BlendFrames"] = new[] { 0, 6, 12, 18 }[blurChoice];
                }
            }
            var audio = Map(danser,"Audio"); audio["MusicVolume"] = music.Value / 100; audio["SampleVolume"] = effects.Value / 100;
            Map(Map(Map(danser,"Playfield"),"Background"),"Dim")["Normal"] = dim.Value / 100;
            var render = Map(app,"render"); render["clipStart"] = clipStart.Value; render["clipEnd"] = clipEnd.Value;
            if (skin.SelectedIndex >= 0) Map(danser, "Skin")["CurrentSkin"] = skin.Text;
            var scenes = Map(app, "scenes"); scenes["intro"] = intro.Checked; scenes["outro"] = outro.Checked;
            await SaveSettings();
            await Api("/api/render", new Json { {"replay",replay["id"]},{"mode",mode} });
            status.Text = "Rendu en cours…"; renderPoll.Start();
        } catch { rendering = false; SetButtons(); throw; }
    }
    async Task PollRender() {
        if (pollBusy) return; pollBusy = true;
        try {
            var job = (Json)await Api("/api/job");
            if (job == null) return;
            if (Convert.ToBoolean(Field(job, "running"))) { status.Text = "Rendu en cours — " + Math.Round(Num(job, "progress") * 100) + " %"; return; }
            renderPoll.Stop(); rendering = false; SetButtons();
            status.Text = TextOf(job, "stage") == "done" ? "Vidéo exportée — " + TextOf(job, "out") : TextOf(job, "error");
            if (TextOf(job,"stage")=="done") { latestVideo=TextOf(job,"out"); playResult.Visible=true; }
            montageTag = Convert.ToBoolean(Field(job,"hasGamePreview")) ? "Images du dernier rendu" : "Aperçu du montage";
            if(!videosOpen)previewTag.Text=montageTag;
            if(TextOf(job,"stage")=="done" && TextOf(job,"mode")=="preview" && !editing) await OpenLatestVideo();
            else await RefreshPreview();
        } catch (Exception e) { status.Text = e.Message; }
        finally { pollBusy = false; }
    }
    void SetButtons() {
        test.Enabled = export.Enabled = !rendering && replays.SelectedIndex >= 0;
        cancel.Enabled = cancel.Visible = rendering;
    }
    Task StartTosu() {
        if (tosu == null || tosu.HasExited) {
            var dir = Path.Combine(root, "runtime", "tosu");
            tosu = Launch(Path.Combine(dir, "tosu.exe"), "", dir);
        }
        status.Text = "tosu est lancé pour le direct.";
        return Task.CompletedTask;
    }
    void StopChildren() {
        renderPoll.Stop();
        if (worker != null && !worker.HasExited) {
            try {
                using (var request = new HttpRequestMessage(HttpMethod.Post, "/api/quit")) {
                    request.Headers.Add("x-token", token);
                    request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                    http.SendAsync(request).Wait(600);
                }
            } catch { }
            if (!worker.WaitForExit(700)) worker.Kill();
        }
        if (tosu != null && !tosu.HasExited) tosu.Kill();
        http.Dispose();
    }
}
