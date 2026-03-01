#!/usr/bin/env python3
"""
Quick Test Script for CodIn Agent
Tests all endpoints to verify functionality
"""

import requests
import json

BASE_URL = "http://127.0.0.1:43120"

def test_health():
    """Test health endpoint"""
    print("🔍 Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"✅ Health check: {response.json()}")
        return True
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_detect_language():
    """Test language detection"""
    print("\n🔍 Testing language detection...")
    test_cases = [
        ("Hello World", "en"),
        ("नमस्ते दुनिया", "hi"),
        ("வணக்கம் உலகம்", "ta"),
    ]
    
    for text, expected_lang in test_cases:
        try:
            response = requests.post(
                f"{BASE_URL}/api/detect-language",
                json={"text": text},
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            result = response.json()
            detected = result.get("language", "unknown")
            status = "✅" if detected == expected_lang else "⚠️"
            print(f"{status} '{text}' → {result.get('name')} ({detected})")
        except Exception as e:
            print(f"❌ Detection failed for '{text}': {e}")

def test_languages():
    """Test supported languages endpoint"""
    print("\n🔍 Testing supported languages...")
    try:
        response = requests.get(f"{BASE_URL}/api/languages", timeout=5)
        languages = response.json()["languages"]
        print("✅ Supported languages:")
        for lang in languages:
            print(f"   • {lang['native']} ({lang['code']})")
        return True
    except Exception as e:
        print(f"❌ Languages endpoint failed: {e}")
        return False

def test_completion():
    """Test completion endpoint"""
    print("\n🔍 Testing completion endpoint...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/completion",
            json={
                "prompt": "Write a Python function to calculate factorial",
                "temperature": 0.7,
                "max_tokens": 100
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        result = response.json()
        print(f"✅ Completion response: {result.get('completion')[:80]}...")
        return True
    except Exception as e:
        print(f"❌ Completion failed: {e}")
        return False

def main():
    print("=" * 60)
    print("🚀 CodIn Agent Test Suite")
    print("=" * 60)
    
    # Run all tests
    tests = [
        test_health,
        test_languages,
        test_detect_language,
        test_completion,
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"❌ Test failed: {e}")
            results.append(False)
    
    # Summary
    print("\n" + "=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"📊 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Agent is working perfectly.")
    else:
        print("⚠️  Some tests failed. Check agent configuration.")
    print("=" * 60)

if __name__ == "__main__":
    main()
