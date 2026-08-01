/*
 * Single source of truth for the three identifiers that must agree across
 * JS, the Swift extension, the generated Xcode target, and the .apns fixtures.
 *
 * These are duplicated into Swift as string literals (there is no way to share
 * a constant across the process boundary), so treat this file as the canonical
 * definition and grep for the literals when changing anything here.
 */
const BUNDLE_IDENTIFIER = 'com.demo.pusharch'
const APP_GROUP = `group.${BUNDLE_IDENTIFIER}`
const EXTENSION_NAME = 'DemoNSE'

module.exports = {BUNDLE_IDENTIFIER, APP_GROUP, EXTENSION_NAME}
