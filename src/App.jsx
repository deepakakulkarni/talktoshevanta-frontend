import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Mic, MicOff, Volume2, VolumeX, AlertCircle } from 'lucide-react'
import './App.css'

function App() {
  const [isListening, setIsListening] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [hasGreeted, setHasGreeted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [micPermission, setMicPermission] = useState('unknown')
  const [error, setError] = useState('')
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)

  // Check microphone permission
  useEffect(() => {
    checkMicrophonePermission()
  }, [])

  const checkMicrophonePermission = async () => {
    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' })
        setMicPermission(permission.state)
        
        permission.onchange = () => {
          setMicPermission(permission.state)
        }
      }
    } catch (error) {
      console.log('Permission API not supported')
    }
  }

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'mr-IN' // Marathi language
      
      recognitionRef.current.onstart = () => {
        setIsListening(true)
        setError('')
        console.log('Speech recognition started')
      }
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        console.log('Speech recognized:', transcript)
        setTranscript(transcript)
        handleSpeechInput(transcript)
      }
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        
        if (event.error === 'not-allowed') {
          setError('माइक्रोफोनची परवानगी नाकारली गेली. कृपया ब्राउझर सेटिंग्जमध्ये माइक्रोफोनची परवानगी द्या.')
        } else if (event.error === 'no-speech') {
          setError('कोणताही आवाज ऐकू आला नाही. कृपया पुन्हा प्रयत्न करा.')
        } else {
          setError('आवाज ओळखण्यात समस्या आली. कृपया पुन्हा प्रयत्न करा.')
        }
      }
      
      recognitionRef.current.onend = () => {
        setIsListening(false)
        console.log('Speech recognition ended')
      }
    } else {
      setError('तुमचा ब्राउझर आवाज ओळखण्याचे समर्थन करत नाही.')
    }
  }, [])

  // Greet user on first load
  useEffect(() => {
    if (!hasGreeted) {
      greetUser()
      setHasGreeted(true)
    }
  }, [hasGreeted])

  const greetUser = async () => {
    const greetingText = "नमस्कार! मी शेवंता आहे. तुम्ही माझ्याशी बोलू शकता. मी तुमच्या आवाजाला उत्तर देईन."
    setResponse(greetingText)
    
    try {
      // Try to use the pre-generated greeting audio
      await playBackendAudio('/shevanta_greeting.wav')
    } catch (error) {
      console.log('Using fallback TTS for greeting')
      await speakText(greetingText)
    }
  }

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // Stop the stream immediately
      setMicPermission('granted')
      setError('')
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setMicPermission('denied')
      setError('माइक्रोफोनची परवानगी आवश्यक आहे. कृपया ब्राउझर सेटिंग्जमध्ये परवानगी द्या.')
      return false
    }
  }

  const startListening = async () => {
    if (!recognitionRef.current) {
      setError('आवाज ओळखण्याचे समर्थन उपलब्ध नाही.')
      return
    }

    if (micPermission !== 'granted') {
      const granted = await requestMicrophonePermission()
      if (!granted) return
    }

    if (!isListening) {
      setTranscript('')
      setError('')
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Failed to start recognition:', error)
        setError('आवाज ओळखणे सुरू करण्यात समस्या आली.')
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }

  const handleSpeechInput = async (text) => {
    setIsLoading(true)
    try {
      // Send text to backend for processing and voice generation
      const response = await fetch('/api/process-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text })
      })
      
      if (!response.ok) {
        throw new Error('Failed to process text')
      }
      
      const data = await response.json()
      const responseText = data.response || generateResponse(text)
      setResponse(responseText)
      
      // Play the generated audio if available
      if (data.audio_url) {
        await playBackendAudio(data.audio_url)
      } else {
        // Fallback to browser TTS
        await speakText(responseText)
      }
    } catch (error) {
      console.error('Error processing speech:', error)
      // Fallback to local processing
      let responseText = generateResponse(text)
      setResponse(responseText)
      await speakText(responseText)
    } finally {
      setIsLoading(false)
    }
  }

  const playBackendAudio = async (audioUrl) => {
    return new Promise((resolve, reject) => {
      try {
        const audio = new Audio(audioUrl)
        audio.onloadstart = () => setIsPlaying(true)
        audio.onended = () => {
          setIsPlaying(false)
          resolve()
        }
        audio.onerror = () => {
          setIsPlaying(false)
          reject(new Error('Audio playback failed'))
        }
        audio.play()
      } catch (error) {
        setIsPlaying(false)
        reject(error)
      }
    })
  }

  const generateResponse = (input) => {
    const lowerInput = input.toLowerCase()
    
    if (lowerInput.includes('नमस्कार') || lowerInput.includes('हॅलो') || lowerInput.includes('hello')) {
      return "नमस्कार! मी शेवंता आहे. तुम्हाला कसे मदत करू शकते?"
    } else if (lowerInput.includes('तुझे नाव') || lowerInput.includes('name')) {
      return "माझे नाव शेवंता आहे. मी एक आवाज सहाय्यक आहे."
    } else if (lowerInput.includes('कसे आहेस') || lowerInput.includes('how are you')) {
      return "मी ठीक आहे, धन्यवाद! तुम्ही कसे आहात?"
    } else if (lowerInput.includes('धन्यवाद') || lowerInput.includes('thank you')) {
      return "तुमचे स्वागत आहे! मला तुमची मदत करून आनंद झाला."
    } else if (lowerInput.includes('बाय') || lowerInput.includes('bye')) {
      return "अलविदा! पुन्हा भेटूया!"
    } else {
      return "मला समजले. तुम्ही आणखी काही विचारू शकता."
    }
  }

  const speakText = async (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'mr-IN'
        utterance.pitch = 1.5 // Higher pitch as requested
        utterance.rate = 0.9
        utterance.volume = 1
        
        utterance.onstart = () => setIsPlaying(true)
        utterance.onend = () => {
          setIsPlaying(false)
          resolve()
        }
        utterance.onerror = () => {
          setIsPlaying(false)
          resolve()
        }
        
        speechSynthesis.speak(utterance)
      } else {
        resolve()
      }
    })
  }

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
      setIsPlaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-purple-800 mb-2">TalkToShevanta</h1>
          <p className="text-lg text-purple-600">आवाज सहाय्यक - Voice Assistant</p>
        </div>

        <Card className="mb-6 shadow-lg border-purple-200">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
            <CardTitle className="text-center text-xl">शेवंता - Shevanta</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full mx-auto mb-4 flex items-center justify-center">
                <span className="text-3xl text-white">🎤</span>
              </div>
              <p className="text-gray-600">
                {isLoading ? 'विचार करत आहे...' : 
                 isListening ? 'ऐकत आहे... बोला' : 
                 'माझ्याशी बोला - Talk to me'}
              </p>
            </div>

            {error && (
              <Card className="mb-4 bg-red-50 border-red-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-red-500" size={20} />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center gap-4 mb-6">
              <Button
                onClick={isListening ? stopListening : startListening}
                disabled={isPlaying || isLoading}
                className={`px-8 py-3 text-lg ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-purple-500 hover:bg-purple-600'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="mr-2" />
                    बंद करा
                  </>
                ) : (
                  <>
                    <Mic className="mr-2" />
                    बोला
                  </>
                )}
              </Button>

              {isPlaying && (
                <Button
                  onClick={stopSpeaking}
                  variant="outline"
                  className="px-6 py-3 text-lg border-purple-300"
                >
                  <VolumeX className="mr-2" />
                  थांबवा
                </Button>
              )}
            </div>

            {transcript && (
              <Card className="mb-4 bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <p className="text-sm text-blue-600 mb-1">तुम्ही म्हणालात:</p>
                  <p className="text-blue-800">{transcript}</p>
                </CardContent>
              </Card>
            )}

            {response && (
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-purple-600">शेवंता म्हणते:</p>
                    {isPlaying && <Volume2 className="text-purple-500 animate-pulse" />}
                  </div>
                  <p className="text-purple-800">{response}</p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-500">
          <p>मराठी आणि इंग्रजी दोन्ही भाषांमध्ये बोला</p>
          <p>Speak in both Marathi and English</p>
          {micPermission === 'denied' && (
            <p className="text-red-500 mt-2">
              माइक्रोफोन परवानगी आवश्यक आहे - Microphone permission required
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

