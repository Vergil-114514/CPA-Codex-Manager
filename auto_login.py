"""
OpenAI 自动登录工具
使用已保存的 token 进行登录，自动监听验证码
"""

import sys
import io
import time
import json
import secrets
import hashlib
import base64
import webbrowser
from datetime import datetime
from typing import Optional, Dict, Any

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from curl_cffi import requests as cffi_requests

from src.config import get_settings
from src.config.constants import (
    OAUTH_CLIENT_ID,
    OAUTH_AUTH_URL,
    OAUTH_TOKEN_URL,
    OAUTH_REDIRECT_URI,
    OAUTH_SCOPE,
    OPENAI_API_ENDPOINTS,
    OTP_CODE_PATTERN,
)
from src.database.session import get_db, init_database
from src.database import crud
from src.database.models import Account
from src.services import EmailServiceFactory, EmailServiceType


def _b64url_no_pad(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sha256_b64url_no_pad(s: str) -> str:
    return _b64url_no_pad(hashlib.sha256(s.encode("ascii")).digest())


def _pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def _random_state(nbytes: int = 16) -> str:
    return secrets.token_urlsafe(nbytes)


def generate_oauth_url(state: str, code_challenge: str, client_id: str = None) -> str:
    params = {
        "client_id": client_id or OAUTH_CLIENT_ID,
        "redirect_uri": OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": OAUTH_SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "login",
    }
    return f"{OAUTH_AUTH_URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"


def _jwt_claims_no_verify(id_token: str) -> Dict[str, Any]:
    if not id_token or id_token.count(".") < 2:
        return {}
    payload_b64 = id_token.split(".")[1]
    pad = "=" * ((4 - (len(payload_b64) % 4)) % 4)
    try:
        payload = base64.urlsafe_b64decode((payload_b64 + pad).encode("ascii"))
        return json.loads(payload.decode("utf-8"))
    except Exception:
        return {}


def get_proxy_url() -> Optional[str]:
    settings = get_settings()
    if not settings.proxy_enabled:
        return None
    proxy_type = settings.proxy_type or "http"
    host = settings.proxy_host or "127.0.0.1"
    port = settings.proxy_port or 7890
    return f"{proxy_type}://{host}:{port}"


def create_session(proxy_url: Optional[str] = None):
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    session = cffi_requests.Session(impersonate="chrome120", proxies=proxies)
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    })
    return session


def list_accounts():
    with get_db() as db:
        accounts = db.query(Account).filter(
            Account.status.in_(["active", "expired"])
        ).order_by(Account.updated_at.desc()).all()
        
        if not accounts:
            print("\n❌ 没有找到已保存的账号")
            return None
        
        print("\n" + "=" * 60)
        print("已保存的账号列表:")
        print("=" * 60)
        
        for i, acc in enumerate(accounts, 1):
            status_icon = "✅" if acc.status == "active" else "⚠️"
            print(f"{i}. {status_icon} {acc.email}")
            print(f"   状态: {acc.status}")
            print(f"   注册时间: {acc.registered_at.strftime('%Y-%m-%d %H:%M') if acc.registered_at else 'N/A'}")
            if acc.expires_at:
                expired = acc.expires_at < datetime.utcnow()
                exp_str = acc.expires_at.strftime('%Y-%m-%d %H:%M')
                print(f"   Token 过期: {exp_str} {'(已过期)' if expired else ''}")
            print()
        
        return accounts


def select_account(accounts):
    while True:
        try:
            choice = input("请选择账号编号 (输入 q 退出): ").strip()
            if choice.lower() == 'q':
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(accounts):
                return accounts[idx]
            print("❌ 无效的编号，请重新输入")
        except ValueError:
            print("❌ 请输入数字")


def build_email_service_config(account: Account) -> Optional[Dict[str, Any]]:
    with get_db() as db:
        if account.email_service == "outlook":
            email_service = db.query(crud.EmailService).filter(
                crud.EmailService.service_type == "outlook",
                crud.EmailService.enabled == True
            ).first()
            
            if not email_service:
                print("❌ 没有找到可用的 Outlook 邮箱服务配置")
                return None
            
            config = email_service.config or {}
            return {
                "accounts": [{
                    "email": config.get("email"),
                    "password": config.get("password"),
                    "client_id": config.get("client_id"),
                    "refresh_token": config.get("refresh_token"),
                }],
                "proxy_url": get_proxy_url(),
            }
        
        elif account.email_service == "tempmail":
            settings = get_settings()
            return {
                "base_url": settings.tempmail_base_url,
                "timeout": settings.tempmail_timeout,
                "max_retries": settings.tempmail_max_retries,
                "proxy_url": get_proxy_url(),
            }
        
        elif account.email_service == "cloud_mail":
            settings = get_settings()
            return {
                "base_url": settings.custom_domain_base_url,
                "api_key": settings.custom_domain_api_key.get_secret_value() if settings.custom_domain_api_key else "",
                "proxy_url": get_proxy_url(),
            }
        
        else:
            print(f"❌ 不支持的邮箱服务类型: {account.email_service}")
            return None


def wait_for_verification_code(account: Account, timeout: int = 120) -> Optional[str]:
    print(f"\n📧 正在监听 {account.email} 的验证码...")
    print(f"   超时时间: {timeout} 秒")
    print("   请在浏览器中触发发送验证码...\n")
    
    config = build_email_service_config(account)
    if not config:
        return None
    
    try:
        service_type = EmailServiceType(account.email_service)
    except ValueError:
        print(f"❌ 不支持的邮箱服务: {account.email_service}")
        return None
    
    try:
        service = EmailServiceFactory.create(service_type, config)
        
        start_time = time.time()
        check_count = 0
        
        while time.time() - start_time < timeout:
            check_count += 1
            elapsed = int(time.time() - start_time)
            
            print(f"\r⏳ 等待中... [{elapsed}s/{timeout}s] 检查次数: {check_count}", end="", flush=True)
            
            code = service.get_verification_code(
                email=account.email,
                email_id=account.email_service_id,
                timeout=3,
                pattern=OTP_CODE_PATTERN,
            )
            
            if code:
                print(f"\n\n✅ 验证码获取成功: {code}")
                return code
            
            time.sleep(3)
        
        print(f"\n\n❌ 等待超时，未收到验证码")
        return None
        
    except Exception as e:
        print(f"\n\n❌ 获取验证码失败: {e}")
        return None


def refresh_token(account: Account) -> Optional[Dict[str, Any]]:
    if not account.refresh_token:
        print("❌ 账号没有 refresh_token，无法刷新")
        return None
    
    print("\n🔄 正在刷新 Token...")
    
    proxy_url = get_proxy_url()
    session = create_session(proxy_url)
    
    client_id = account.client_id or OAUTH_CLIENT_ID
    
    try:
        response = session.post(
            OAUTH_TOKEN_URL,
            headers={
                "content-type": "application/x-www-form-urlencoded",
                "accept": "application/json"
            },
            data={
                "client_id": client_id,
                "grant_type": "refresh_token",
                "refresh_token": account.refresh_token,
                "redirect_uri": OAUTH_REDIRECT_URI,
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Token 刷新成功!")
            
            claims = _jwt_claims_no_verify(data.get("id_token", ""))
            email = claims.get("email", account.email)
            
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token", account.refresh_token),
                "id_token": data.get("id_token"),
                "expires_in": data.get("expires_in", 3600),
                "email": email,
            }
        else:
            print(f"❌ Token 刷新失败: HTTP {response.status_code}")
            print(f"   响应: {response.text[:200]}")
            return None
            
    except Exception as e:
        print(f"❌ Token 刷新异常: {e}")
        return None


def update_account_token(account: Account, token_data: Dict[str, Any]):
    with get_db() as db:
        expires_in = token_data.get("expires_in", 3600)
        expires_at = datetime.utcnow() + __import__('datetime').timedelta(seconds=expires_in)
        
        crud.update_account(
            db,
            account.id,
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            id_token=token_data.get("id_token"),
            expires_at=expires_at,
            last_refresh=datetime.utcnow(),
            status="active",
        )
        print(f"✅ 账号 Token 已更新到数据库")


def open_login_page():
    state = _random_state()
    code_verifier = _pkce_verifier()
    code_challenge = _sha256_b64url_no_pad(code_verifier)
    
    auth_url = generate_oauth_url(state, code_challenge)
    
    print("\n" + "=" * 60)
    print("🔗 登录链接:")
    print("=" * 60)
    print(auth_url)
    print("=" * 60)
    
    print("\n🌐 正在打开浏览器...")
    webbrowser.open(auth_url)
    
    print("\n请在浏览器中完成登录:")
    print("1. 输入邮箱地址")
    print("2. 点击发送验证码")
    print("3. 本工具会自动监听验证码")
    
    return state, code_verifier


def interactive_mode():
    print("\n" + "=" * 60)
    print("🚀 OpenAI 自动登录工具")
    print("=" * 60)
    
    accounts = list_accounts()
    if not accounts:
        return
    
    account = select_account(accounts)
    if not account:
        return
    
    print(f"\n✅ 已选择账号: {account.email}")
    
    while True:
        print("\n" + "-" * 40)
        print("请选择操作:")
        print("1. 刷新 Token (使用 refresh_token)")
        print("2. 监听验证码 (手动触发发送)")
        print("3. 打开登录页面")
        print("4. 查看账号详情")
        print("q. 退出")
        print("-" * 40)
        
        choice = input("请输入选项: ").strip().lower()
        
        if choice == '1':
            token_data = refresh_token(account)
            if token_data:
                update_account_token(account, token_data)
                account = crud.get_account_by_id(__import__('src.database.session').database.session.get_db().__enter__(), account.id)
        
        elif choice == '2':
            code = wait_for_verification_code(account)
            if code:
                print(f"\n验证码: {code}")
                print("请手动输入验证码完成登录")
        
        elif choice == '3':
            open_login_page()
            code = wait_for_verification_code(account)
            if code:
                print(f"\n验证码: {code}")
        
        elif choice == '4':
            print(f"\n账号详情:")
            print(f"  邮箱: {account.email}")
            print(f"  状态: {account.status}")
            print(f"  邮箱服务: {account.email_service}")
            print(f"  Client ID: {account.client_id or 'N/A'}")
            print(f"  注册时间: {account.registered_at}")
            print(f"  最后刷新: {account.last_refresh}")
            print(f"  Token 过期: {account.expires_at}")
            print(f"  有 Access Token: {'是' if account.access_token else '否'}")
            print(f"  有 Refresh Token: {'是' if account.refresh_token else '否'}")
        
        elif choice == 'q':
            print("\n👋 再见!")
            break
        
        else:
            print("❌ 无效选项")


def main():
    init_database()
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--listen":
            if len(sys.argv) < 3:
                print("用法: python auto_login.py --listen <邮箱地址> [超时秒数]")
                return
            
            email = sys.argv[2]
            timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 120
            
            with get_db() as db:
                account = crud.get_account_by_email(db, email)
            
            if not account:
                print(f"❌ 未找到邮箱 {email} 对应的账号")
                return
            
            code = wait_for_verification_code(account, timeout)
            if code:
                print(f"\n验证码: {code}")
        
        elif sys.argv[1] == "--refresh":
            if len(sys.argv) < 3:
                print("用法: python auto_login.py --refresh <邮箱地址>")
                return
            
            email = sys.argv[2]
            
            with get_db() as db:
                account = crud.get_account_by_email(db, email)
            
            if not account:
                print(f"❌ 未找到邮箱 {email} 对应的账号")
                return
            
            token_data = refresh_token(account)
            if token_data:
                update_account_token(account, token_data)
        
        elif sys.argv[1] == "--list":
            list_accounts()
        
        else:
            print("未知命令")
            print("用法:")
            print("  python auto_login.py              - 交互模式")
            print("  python auto_login.py --list       - 列出所有账号")
            print("  python auto_login.py --listen <邮箱> [超时]  - 监听验证码")
            print("  python auto_login.py --refresh <邮箱>       - 刷新 Token")
    else:
        interactive_mode()


if __name__ == "__main__":
    main()
