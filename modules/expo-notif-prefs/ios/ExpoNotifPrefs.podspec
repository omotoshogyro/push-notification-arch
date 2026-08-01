Pod::Spec.new do |s|
  s.name           = 'ExpoNotifPrefs'
  s.version        = '1.0.0'
  s.summary        = 'App Group preference bridge shared with the notification service extension'
  s.description    = 'Writes preferences from JS into App Group storage so the NSE can read them while the app is dead.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
