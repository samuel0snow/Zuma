#include "httplib.h"
#include "zuma_api.hpp"
#include <fstream>
#include <iostream>
#include <sstream>
#ifdef _WIN32
#include <windows.h>
#endif

int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif
    const std::string executable = argv[0];
    const auto slash = executable.find_last_of("/\\");
    const auto directory = slash == std::string::npos ? std::string(".") : executable.substr(0, slash);
    std::string levels = directory + "/levels", web = directory + "/web";
    std::size_t port = 8080;
    bool testing = false;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--test-mode") testing = true;
        else if ((arg == "--port" || arg == "--levels" || arg == "--web") && i + 1 < argc) {
            const std::string value = argv[++i];
            if (arg == "--port") {
                if (!zuma::parsePositive(value, port) || port > 65535) { std::cerr << "端口必须为 1…65535\n"; return 1; }
            } else if (arg == "--levels") levels = value;
            else web = value;
        } else { std::cerr << "用法: zuma_gui [--port 8080] [--levels 目录] [--web 目录] [--test-mode]\n"; return 1; }
    }
    std::ifstream index(web + "/index.html");
    if (!index.is_open()) { std::cerr << "找不到网页资源: " << web << "/index.html\n"; return 1; }
    zuma::GameApi api([levels](int id) { return zuma::loadLevel(levels + "/level" + std::to_string(id) + ".txt"); },
                      testing,[levels]{return zuma::discoverLevels(levels);});
    httplib::Server server;
    server.set_payload_max_length(8192);
    server.set_read_timeout(5, 0); server.set_write_timeout(5, 0);
    const std::string host = "127.0.0.1:" + std::to_string(port);
    const std::string alternateHost = "localhost:" + std::to_string(port);
    const auto checkRequest = [&](const httplib::Request& request, httplib::Response& response) {
        const auto requestedHost = request.get_header_value("Host");
        bool rejected = requestedHost != host && requestedHost != alternateHost;
        if (port == 80 && (requestedHost == "127.0.0.1" || requestedHost == "localhost")) rejected = false;
        if (request.has_header("Origin")) rejected = rejected || request.get_header_value("Origin") != "http://" + requestedHost;
        if (request.get_header_value("Sec-Fetch-Site") == "cross-site") rejected = true;
        if (request.method == "POST" && (request.get_header_value("X-Zuma-Client") != "1" ||
            request.get_header_value("Content-Type").find("application/json") != 0)) rejected = true;
        response.set_header("Cache-Control", "no-store");
        response.set_header("X-Content-Type-Options", "nosniff");
        response.set_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        if (rejected) {
            response.status = 403;
            response.set_content(R"({"error":{"code":"FORBIDDEN","message":"仅接受本机同源请求"}})", "application/json; charset=utf-8");
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    };
    server.set_pre_routing_handler([&](const httplib::Request& request, httplib::Response& response) {
        // POST routes validate after httplib consumes the bounded request body.
        // Rejecting earlier can reset the socket before Windows delivers the 403.
        if (request.method == "POST") return httplib::Server::HandlerResponse::Unhandled;
        return checkRequest(request, response);
    });
    auto route = [&](const httplib::Request& request, httplib::Response& response) {
        if (checkRequest(request, response) == httplib::Server::HandlerResponse::Handled) return;
        zuma::Json body = zuma::Json::object();
        if (request.method == "POST") {
            try {
                body = zuma::Json::parse(request.body, [](int depth, zuma::Json::parse_event_t, zuma::Json&) {
                    if (depth > 16) throw std::runtime_error("JSON nesting limit");
                    return true;
                }, false);
            } catch (const std::exception&) { body = zuma::Json::value_t::discarded; }
            if (body.is_discarded()) {
                response.status = 400;
                response.set_content(R"({"error":{"code":"INVALID_JSON","message":"JSON 格式错误"}})", "application/json; charset=utf-8");
                return;
            }
        }
        const auto result = api.handle(request.method, request.path, body);
        response.status = result.status;
        response.set_content(result.body.dump(), "application/json; charset=utf-8");
    };
    server.Get("/api/levels", route); server.Get("/api/game", route);
    server.Get("/api/maps", route);
    server.Get("/api/history", route);
    server.Post("/api/game", route); server.Post("/api/action", route); server.Post("/api/reset", route);
    // Serve only known assets; arbitrary paths never become filesystem paths.
    for (const auto& asset : {"index.html", "style.css", "app.js", "animation.js", "stage.js"}) {
        const std::string filename = asset;
        auto serve = [web, filename](const httplib::Request&, httplib::Response& response) {
            std::ifstream file(web + "/" + filename, std::ios::binary);
            if (!file.is_open()) { response.status = 404; return; }
            std::ostringstream bytes; bytes << file.rdbuf();
            const auto mime = filename == "style.css" ? "text/css" : filename.size()>3 && filename.substr(filename.size()-3)==".js" ? "application/javascript" : "text/html";
            response.set_content(bytes.str(), std::string(mime) + "; charset=utf-8");
        };
        auto routePath = "/" + filename;
        for (std::size_t i = 0; (i = routePath.find('.', i)) != std::string::npos; i += 2) routePath.insert(i, "\\");
        server.Get(routePath, serve);
        if (filename == "index.html") server.Get("/", serve);
    }
    // Assets are explicit routes, never an arbitrary directory mount.
    const std::vector<std::string> assets = {
        "favicon.svg", "backgrounds/courtyard.webp", "launcher/pedestal.svg", "track/paving-512x128.jpg",
        "balls/vector/red.svg", "balls/vector/green.svg", "balls/vector/blue.svg", "balls/vector/yellow.svg", "balls/vector/purple.svg",
        "balls/gemstone/red.webp", "balls/gemstone/green.webp", "balls/gemstone/blue.webp", "balls/gemstone/yellow.webp", "balls/gemstone/purple.webp", "launcher/pedestal-painted.webp",
        "icons/ui/back.svg", "icons/ui/stop.svg", "icons/ui/boom.svg", "icons/ui/victory.svg", "icons/ui/defeat.svg",
        "effects/flash-seq/sheet.png", "effects/boom-seq/sheet.png", "effects/ring-seq/sheet.png", "CREDITS.md"
    };
    for (const auto& filename : assets) {
        auto routePath = "/assets/" + filename;
        for (std::size_t i = 0; (i = routePath.find('.', i)) != std::string::npos; i += 2) routePath.insert(i, "\\");
        server.Get(routePath, [web, filename](const httplib::Request&, httplib::Response& response) {
            std::ifstream file(web + "/assets/" + filename, std::ios::binary);
            if (!file.is_open()) { response.status = 404; return; }
            std::ostringstream bytes; bytes << file.rdbuf();
            const auto extension = filename.substr(filename.find_last_of('.') + 1);
            const auto mime = extension == "svg" ? "image/svg+xml" : extension == "png" ? "image/png" : extension == "jpg" ? "image/jpeg" : extension == "webp" ? "image/webp" : "text/plain; charset=utf-8";
            response.set_content(bytes.str(), mime);
        });
    }
    server.Get("/favicon.ico", [](const httplib::Request&, httplib::Response& response) { response.status = 204; });
    std::cout << "Zuma GUI: http://127.0.0.1:" << port << "\n按 Ctrl+C 停止服务。\n" << std::flush;
    if (!server.listen("127.0.0.1", static_cast<int>(port))) {
        std::cerr << "无法启动服务，端口可能已占用，请用 --port 指定其他端口。\n"; return 1;
    }
}
