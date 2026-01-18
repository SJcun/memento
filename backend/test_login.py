#!/usr/bin/env python
"""
测试Memento API登录功能
"""
import sys
import requests

def test_login():
    """测试登录API"""
    base_url = "http://localhost:8000"

    # 1. 测试健康检查
    print("1. 测试健康检查...")
    try:
        health_resp = requests.get(f"{base_url}/health")
        print(f"   健康检查: {health_resp.status_code} - {health_resp.json()}")
    except Exception as e:
        print(f"   健康检查失败: {e}")
        return False

    # 2. 测试应用信息
    print("2. 测试应用信息...")
    try:
        info_resp = requests.get(f"{base_url}/info")
        print(f"   应用信息: {info_resp.status_code} - {info_resp.json()}")
    except Exception as e:
        print(f"   应用信息失败: {e}")
        return False

    # 3. 测试登录（默认管理员）
    print("3. 测试登录（默认管理员）...")
    try:
        login_data = {
            "username": "admin",
            "password": "admin123"
        }
        login_resp = requests.post(
            f"{base_url}/token",
            data=login_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if login_resp.status_code == 200:
            login_result = login_resp.json()
            token = login_result.get("access_token")
            print(f"   登录成功! Token: {token[:20]}...")
            print(f"   用户配置: {login_result.get('user_config')}")

            # 4. 测试使用token获取事件
            print("4. 测试获取事件...")
            events_resp = requests.get(
                f"{base_url}/events",
                headers={"Authorization": f"Bearer {token}"}
            )
            if events_resp.status_code == 200:
                events = events_resp.json()
                print(f"   获取事件成功! 事件数量: {len(events)}")
                return True
            else:
                print(f"   获取事件失败: {events_resp.status_code} - {events_resp.text}")
                return False
        else:
            print(f"   登录失败: {login_resp.status_code} - {login_resp.text}")
            return False
    except Exception as e:
        print(f"   登录测试异常: {e}")
        return False

if __name__ == "__main__":
    print("开始测试Memento API...")
    success = test_login()
    if success:
        print("\n✅ 所有测试通过!")
        sys.exit(0)
    else:
        print("\n❌ 测试失败!")
        sys.exit(1)