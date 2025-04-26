import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Save, Volume2, Settings, Clock, HardDrive, Database } from 'lucide-react';

// APIキーの安全な管理のためのユーティリティ関数
const encryptData = (data, password) => {
  // 実際の実装では適切な暗号化ライブラリを使用
  // 簡易的な実装としてBase64エンコード
  return btoa(password + ':' + data);
};

const decryptData = (encryptedData, password) => {
  try {
    // 簡易的な復号（Base64デコード）
    const decoded = atob(encryptedData);
    if (decoded.startsWith(password + ':')) {
      return decoded.substring((password + ':').length);
    }
    return null;
  } catch (e) {
    return null;
  }
};

// ローカルストレージからAPIキーを取得
const getStoredApiKey = (service, password) => {
  const key = localStorage.getItem(`tts_${service}_api_key`);
  if (!key) return '';
  
  return decryptData(key, password) || '';
};

// ローカルストレージにAPIキーを保存
const storeApiKey = (service, apiKey, password, remember) => {
  if (remember && apiKey) {
    const encryptedKey = encryptData(apiKey, password);
    localStorage.setItem(`tts_${service}_api_key`, encryptedKey);
  } else {
    localStorage.removeItem(`tts_${service}_api_key`);
  }
};

const TextToSpeechApp = () => {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ttsService, setTtsService] = useState('gpt4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyPassword, setApiKeyPassword] = useState(''); // 暗号化パスワード
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveLocation, setSaveLocation] = useState('local');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voices, setVoices] = useState([]);  // 利用可能な音声リスト
  const [selectedVoice, setSelectedVoice] = useState('');  // 選択された音声
  
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);
  
  // ファイルアップロード処理
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setText(e.target.result);
    };
    reader.readAsText(file);
  };
  
  // OpenAI GPT-4o-mini TTSのAPI呼び出し
  const generateOpenAISpeech = async () => {
    try {
      // APIエンドポイント
      const endpoint = 'https://api.openai.com/v1/audio/speech';
      
      // リクエストヘッダー
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      
      // テキストチャンクに分割（APIの制限に対応）
      const MAX_CHARS = 4000; // OpenAI TTSの最大文字数
      const textChunks = [];
      
      // テキストを適切なサイズに分割
      for (let i = 0; i < text.length; i += MAX_CHARS) {
        textChunks.push(text.substring(i, i + MAX_CHARS));
      }
      
      // 各チャンクを順番に処理して音声を生成
      const audioBlobs = [];
      
      for (const chunk of textChunks) {
        // リクエストボディ
        const body = JSON.stringify({
          model: 'tts-1', // GPT-4o-miniの場合はモデル名を適切に変更
          input: chunk,
          voice: selectedVoice || 'alloy', // 選択された音声
          response_format: 'mp3'
        });
        
        // APIリクエスト
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: body
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }
        
        // 音声データを取得してBlobに変換
        const audioData = await response.arrayBuffer();
        const blob = new Blob([audioData], { type: 'audio/mp3' });
        audioBlobs.push(blob);
      }
      
      // 複数のBlobがある場合は結合
      let finalBlob;
      if (audioBlobs.length === 1) {
        finalBlob = audioBlobs[0];
      } else {
        // 複数のBlobを結合する処理（実際にはより複雑な実装が必要）
        // 注意: 実際のmp3結合はより高度な処理が必要です
        finalBlob = new Blob(audioBlobs, { type: 'audio/mp3' });
      }
      
      const url = URL.createObjectURL(finalBlob);
      return url;
    } catch (error) {
      console.error('OpenAI TTS APIエラー:', error);
      throw error;
    }
  };
  
  // ElevenLabs TTSのAPI呼び出し
  const generateElevenLabsSpeech = async () => {
    try {
      // APIエンドポイント (選択された音声IDを使用)
      const voiceId = selectedVoice || '21m00Tcm4TlvDq8ikWAM'; // デフォルトはRachel voice
      
      // テキストチャンクに分割（APIの制限に対応）
      const MAX_CHARS = 5000; // ElevenLabsの一般的な制限
      const textChunks = [];
      
      // テキストを適切なサイズに分割
      for (let i = 0; i < text.length; i += MAX_CHARS) {
        textChunks.push(text.substring(i, i + MAX_CHARS));
      }
      
      // 各チャンクを順番に処理して音声を生成
      const audioBlobs = [];
      
      for (const chunk of textChunks) {
        const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        
        // リクエストヘッダー
        const headers = {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        };
        
        // リクエストボディ
        const body = JSON.stringify({
          text: chunk,
          model_id: 'eleven_multilingual_v2', // 最新のモデルを使用
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            style: 0.0, // 標準スタイル
            use_speaker_boost: true
          }
        });
        
        // APIリクエスト
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: body
        });
        
        if (!response.ok) {
          let errorMessage = response.statusText;
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } catch {
            // JSONとして解析できない場合はテキストで取得
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          }
          
          throw new Error(`ElevenLabs API Error: ${errorMessage}`);
        }
        
        // 音声データを取得してBlobに変換
        const audioData = await response.arrayBuffer();
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        audioBlobs.push(blob);
      }
      
      // 複数のBlobがある場合は結合
      let finalBlob;
      if (audioBlobs.length === 1) {
        finalBlob = audioBlobs[0];
      } else {
        // 複数のBlobを結合する処理
        finalBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
      }
      
      const url = URL.createObjectURL(finalBlob);
      return url;
    } catch (error) {
      console.error('ElevenLabs TTS APIエラー:', error);
      throw error;
    }
  };
  
  // 音声生成処理
  const generateSpeech = async () => {
    if (!text.trim()) {
      setErrorMessage('テキストを入力してください');
      return;
    }
    
    if (!apiKey.trim()) {
      setErrorMessage('APIキーを入力してください');
      return;
    }
    
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      let audioUrl;
      
      // 選択したサービスに応じてAPIを呼び出す
      if (ttsService === 'gpt4o-mini') {
        audioUrl = await generateOpenAISpeech();
      } else if (ttsService === 'elevenlabs') {
        audioUrl = await generateElevenLabsSpeech();
      }
      
      setAudioUrl(audioUrl);
    } catch (error) {
      console.error('音声生成エラー:', error);
      setErrorMessage(`音声生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Blobから ArrayBufferを取得
  const blobToArrayBuffer = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  };
  
  // Google Driveにファイルをアップロード
  const uploadToGoogleDrive = async (fileName, arrayBuffer, mimeType) => {
    try {
      const gapi = window.gapi;
      
      // ファイルメタデータ
      const metadata = {
        name: fileName,
        mimeType: mimeType
      };
      
      // アップロードAPIのパラメータ
      const params = {
        uploadType: 'multipart'
      };
      
      // multipartリクエストの境界文字列
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      
      // リクエストボディの作成
      const contentType = mimeType || 'application/octet-stream';
      let body = delimiter;
      body += 'Content-Type: application/json\r\n\r\n';
      body += JSON.stringify(metadata);
      body += delimiter;
      body += `Content-Type: ${contentType}\r\n\r\n`;
      
      // テキストとバイナリデータを結合
      const textEncoder = new TextEncoder();
      const bodyHeader = textEncoder.encode(body);
      const bodyFooter = textEncoder.encode(closeDelimiter);
      
      // 最終的なリクエストボディを作成
      const bodyLength = bodyHeader.length + arrayBuffer.byteLength + bodyFooter.length;
      const finalBody = new Uint8Array(bodyLength);
      finalBody.set(bodyHeader, 0);
      finalBody.set(new Uint8Array(arrayBuffer), bodyHeader.length);
      finalBody.set(bodyFooter, bodyHeader.length + arrayBuffer.byteLength);
      
      // Google Drive APIリクエスト
      const response = await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: params,
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: finalBody
      });
      
      return response.result;
    } catch (error) {
      console.error('Google Driveアップロードエラー:', error);
      throw error;
    }
  };
  
  // 音声ファイル保存
  const saveAudio = async () => {
    if (!audioUrl) {
      setErrorMessage('保存する音声が生成されていません');
      return;
    }
    
    try {
      const fileName = `speech_${new Date().getTime()}.mp3`;
      
      if (saveLocation === 'local') {
        // ローカルに保存
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setErrorMessage('音声ファイルを正常に保存しました');
      } else if (saveLocation === 'gdrive') {
        // Google Driveに保存
        if (!isAuthenticated) {
          setErrorMessage('Google Driveに接続されていません');
          return;
        }
        
        setErrorMessage('Google Driveに保存中...');
        
        // URLからBlobを取得
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        
        // BlobからArrayBufferに変換
        const arrayBuffer = await blobToArrayBuffer(blob);
        
        // Google Driveにアップロード
        await uploadToGoogleDrive(fileName, arrayBuffer, 'audio/mp3');
        
        setErrorMessage('音声ファイルをGoogle Driveに正常に保存しました');
      }
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      setErrorMessage(`ファイルの保存中にエラーが発生しました: ${error.message}`);
    }
  };
  
  // Google API クライアントライブラリのロード
  const loadGoogleApiClient = () => {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve(window.gapi);
        return;
      }
      
      // Google API JavaScriptライブラリをロード
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client:auth2', () => {
          resolve(window.gapi);
        });
      };
      script.onerror = () => {
        reject(new Error('Google API クライアントのロードに失敗しました'));
      };
      
      document.body.appendChild(script);
    });
  };
  
  // Google OAuth認証の初期化
  const initGoogleAuth = async (gapi) => {
    try {
      await gapi.client.init({
        apiKey: 'YOUR_API_KEY', // 実際の実装では環境変数や安全な方法で管理
        clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // 実際の実装では環境変数や安全な方法で管理
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        scope: 'https://www.googleapis.com/auth/drive.file'
      });
      
      return gapi.auth2.getAuthInstance();
    } catch (error) {
      console.error('Google認証の初期化エラー:', error);
      throw error;
    }
  };
  
  // Google Driveへの接続
  const connectToGoogleDrive = async () => {
    try {
      setErrorMessage('Google APIに接続中...');
      
      // Google APIクライアントをロード
      const gapi = await loadGoogleApiClient();
      
      // 認証を初期化
      const authInstance = await initGoogleAuth(gapi);
      
      // ユーザーにログインを促す
      const isSignedIn = await authInstance.signIn();
      
      if (isSignedIn) {
        setIsAuthenticated(true);
        setErrorMessage('Google Driveに正常に接続しました');
      } else {
        throw new Error('Google認証に失敗しました');
      }
    } catch (error) {
      console.error('Google Drive接続エラー:', error);
      setErrorMessage(`Google Driveへの接続に失敗しました: ${error.message}`);
    }
  };
  
  // プログレスバーの更新
  const updateProgressBar = () => {
    if (audioRef.current && progressBarRef.current) {
      const percentage = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      progressBarRef.current.style.width = `${percentage}%`;
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  
  // プログレスバークリック時の処理
  const handleProgressBarClick = (e) => {
    if (audioRef.current) {
      const progressBar = e.currentTarget;
      const clickPosition = (e.clientX - progressBar.getBoundingClientRect().left) / progressBar.offsetWidth;
      audioRef.current.currentTime = clickPosition * audioRef.current.duration;
    }
  };
  
  // 再生速度変更
  const handlePlaybackRateChange = (newRate) => {
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };
  
  // 再生/一時停止の切り替え
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  // オーディオイベントリスナー
  useEffect(() => {
    const audio = audioRef.current;
    
    if (audio) {
      audio.addEventListener('timeupdate', updateProgressBar);
      audio.addEventListener('ended', () => setIsPlaying(false));
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      
      return () => {
        audio.removeEventListener('timeupdate', updateProgressBar);
        audio.removeEventListener('ended', () => setIsPlaying(false));
        audio.removeEventListener('loadedmetadata', () => setDuration(audio.duration));
      };
    }
  }, [audioUrl]);
  
  // 時間のフォーマット（秒→MM:SS）
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // コンポーネントのマウント時にAPIキーをロード
  useEffect(() => {
    // パスワードが設定されていれば、保存されたAPIキーをロード
    if (apiKeyPassword) {
      const storedKey = getStoredApiKey(ttsService, apiKeyPassword);
      if (storedKey) {
        setApiKey(storedKey);
        setRememberApiKey(true);
      }
    }
  }, [ttsService, apiKeyPassword]);
  
  // API設定を保存
  const saveApiSettings = () => {
    if (rememberApiKey && apiKeyPassword) {
      storeApiKey(ttsService, apiKey, apiKeyPassword, true);
      setErrorMessage('APIキー設定を保存しました');
    } else if (!apiKeyPassword && rememberApiKey) {
      setErrorMessage('APIキーを保存するにはパスワードを設定してください');
    }
  };
  
  // 利用可能な音声を取得
  const fetchAvailableVoices = async () => {
    try {
      setErrorMessage('利用可能な音声を取得中...');
      
      if (ttsService === 'gpt4o-mini') {
        // OpenAIの場合は固定の音声セット
        setVoices([
          { id: 'alloy', name: 'Alloy (中性)' },
          { id: 'echo', name: 'Echo (男性)' },
          { id: 'fable', name: 'Fable (男性)' },
          { id: 'onyx', name: 'Onyx (男性)' },
          { id: 'nova', name: 'Nova (女性)' },
          { id: 'shimmer', name: 'Shimmer (女性)' }
        ]);
        setSelectedVoice('alloy');
      } else if (ttsService === 'elevenlabs') {
        // ElevenLabsのAPIから音声リストを取得
        const endpoint = 'https://api.elevenlabs.io/v1/voices';
        
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey
          }
        });
        
        if (!response.ok) {
          throw new Error('音声リストの取得に失敗しました');
        }
        
        const data = await response.json();
        const voiceList = data.voices.map(voice => ({
          id: voice.voice_id,
          name: voice.name
        }));
        
        setVoices(voiceList);
        if (voiceList.length > 0) {
          setSelectedVoice(voiceList[0].id);
        }
      }
      
      setErrorMessage('');
    } catch (error) {
      console.error('音声リスト取得エラー:', error);
      setErrorMessage(`音声リストの取得に失敗しました: ${error.message}`);
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-gray-100 p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">テキスト読み上げ＆音声生成ツール</h1>
      
      {/* テキスト入力セクション */}
      <div className="mb-6">
        <div className="flex items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-700">テキスト入力</h2>
          <label className="ml-4 flex items-center cursor-pointer text-blue-600 hover:text-blue-800">
            <Upload size={18} className="mr-1" />
            ファイルをアップロード
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここにテキストを入力するか、.txt/.mdファイルをアップロードしてください"
          className="w-full h-40 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      {/* 設定セクション */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center mb-3">
            <Settings size={18} className="mr-2 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-700">TTS設定</h2>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">音声生成サービス</label>
            <select
              value={ttsService}
              onChange={(e) => {
                setTtsService(e.target.value);
                setVoices([]);
                setSelectedVoice('');
              }}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="gpt4o-mini">GPT-4o-mini TTS</option>
              <option value="elevenlabs">ElevenLabs TTS</option>
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">APIキー</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="APIキーを入力してください"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">APIキー保存用パスワード</label>
            <input
              type="password"
              value={apiKeyPassword}
              onChange={(e) => setApiKeyPassword(e.target.value)}
              placeholder="APIキーを保存するためのパスワード"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex items-center mb-3">
            <input
              type="checkbox"
              id="remember-api-key"
              checked={rememberApiKey}
              onChange={(e) => setRememberApiKey(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="remember-api-key" className="text-sm text-gray-700">
              APIキーを保存する
            </label>
            <button
              onClick={saveApiSettings}
              disabled={!rememberApiKey || !apiKeyPassword}
              className="ml-auto px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              設定を保存
            </button>
          </div>
          <div className="mb-3">
            <button
              onClick={fetchAvailableVoices}
              disabled={!apiKey}
              className="w-full p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              利用可能な音声を取得
            </button>
          </div>
          {voices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">音声の選択</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center mb-3">
            <Save size={18} className="mr-2 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-700">保存設定</h2>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">保存先</label>
            <select
              value={saveLocation}
              onChange={(e) => setSaveLocation(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="local">ローカル</option>
              <option value="gdrive">Google Drive</option>
            </select>
          </div>
          {saveLocation === 'gdrive' && (
            <button
              onClick={connectToGoogleDrive}
              disabled={isAuthenticated}
              className={`w-full p-2 rounded-md ${
                isAuthenticated
                  ? 'bg-green-100 text-green-700 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isAuthenticated ? 'Google Driveに接続済み' : 'Google Driveに接続'}
            </button>
          )}
        </div>
      </div>
      
      {/* 生成ボタン */}
      <button
        onClick={generateSpeech}
        disabled={isLoading}
        className="bg-blue-600 text-white py-3 px-6 rounded-lg mb-6 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <span className="animate-spin h-5 w-5 mr-3 border-t-2 border-b-2 border-white rounded-full"></span>
            音声生成中...
          </>
        ) : (
          <>
            <Volume2 size={20} className="mr-2" />
            音声を生成する
          </>
        )}
      </button>
      
      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
          {errorMessage}
        </div>
      )}
      
      {/* オーディオプレーヤー */}
      {audioUrl && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex items-center mb-3">
            <Volume2 size={20} className="mr-2 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-700">音声プレーヤー</h2>
          </div>
          
          <audio ref={audioRef} src={audioUrl} className="hidden" />
          
          {/* 再生コントロール */}
          <div className="flex items-center mb-4">
            <button
              onClick={togglePlayPause}
              className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <div className="ml-4 flex items-center">
              <Clock size={18} className="mr-2 text-gray-600" />
              <span className="text-sm text-gray-600">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            
            <div className="ml-auto flex items-center">
              <span className="text-sm text-gray-600 mr-2">再生速度:</span>
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="p-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="1.75">1.75x</option>
                <option value="2">2.0x</option>
              </select>
            </div>
          </div>
          
          {/* プログレスバー */}
          <div
            className="w-full h-3 bg-gray-200 rounded-full cursor-pointer relative"
            onClick={handleProgressBarClick}
          >
            <div
              ref={progressBarRef}
              className="h-full bg-blue-600 rounded-full"
              style={{ width: '0%' }}
            ></div>
          </div>
          
          {/* 保存ボタン */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={saveAudio}
              className="flex items-center bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
            >
              {saveLocation === 'local' ? (
                <>
                  <HardDrive size={18} className="mr-2" />
                  ローカルに保存
                </>
              ) : (
                <>
                  <Database size={18} className="mr-2" />
                  Google Driveに保存
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextToSpeechApp;