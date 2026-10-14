#include "zuma_maps.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace zuma {
namespace {
constexpr double pi = 3.14159265358979323846, eps = 1e-8;
Point sub(Point a, Point b) { return {a.x-b.x,a.y-b.y}; }
double dot(Point a, Point b) { return a.x*b.x+a.y*b.y; }
double cross(Point a, Point b) { return a.x*b.y-a.y*b.x; }
double length(Point a) { return std::hypot(a.x,a.y); }
Point unit(Point a) { auto n=length(a); return n>eps?Point{a.x/n,a.y/n}:Point{1,0}; }
void measure(MapGeometry& map) {
    map.distances={0};
    for (std::size_t i=1;i<map.path.size();++i)
        map.distances.push_back(map.distances.back()+length(sub(map.path[i],map.path[i-1])));
}
void line(std::vector<Point>& points, Point a, Point b) {
    const auto steps=static_cast<int>(std::ceil(length(sub(b,a))/4));
    for(int i=0;i<=steps;++i) {
        const double t=steps?double(i)/steps:0;
        points.push_back({a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t});
    }
}
}
Point MapGeometry::at(double distance) const {
    distance=std::clamp(distance,0.0,distances.back());
    auto it=std::upper_bound(distances.begin(),distances.end(),distance);
    const auto i=std::min<std::size_t>(std::max<std::size_t>(it-distances.begin(),1),path.size()-1);
    const double span=distances[i]-distances[i-1];
    const double t=span>eps?(distance-distances[i-1])/span:0;
    return {path[i-1].x+(path[i].x-path[i-1].x)*t,path[i-1].y+(path[i].y-path[i-1].y)*t};
}
Point MapGeometry::slot(std::size_t index) const { return at(diameter+index*pitch); }
Point MapGeometry::tangent(std::size_t index) const {
    const double s=diameter+index*pitch;
    return unit(sub(at(s+1),at(s-1)));
}
MapGeometry makeMap(const std::string& id, std::size_t capacity) {
    MapGeometry map; map.id=id;
    const double total=map.diameter*2+(capacity+1)*map.pitch;
    if (id=="straight") {
        map.title="直线地图"; map.path={{0,0},{total,0}}; map.launcher={total/2,250};
    } else if (id=="s") {
        map.title="S 形地图";
        line(map.path,{540,0},{160,0});
        for(int i=1;i<=80;++i) {const double a=-pi/2-pi*i/80;map.path.push_back({160+80*std::cos(a),80+80*std::sin(a)});}
        line(map.path,{160,160},{540,160});
        for(int i=1;i<=80;++i) {const double a=-pi/2+pi*i/80;map.path.push_back({540+80*std::cos(a),240+80*std::sin(a)});}
        line(map.path,{540,320},{100,320}); map.launcher={350,440};
    } else if (id=="spiral") {
        map.title="螺旋类环形地图";
        map.diameter=44;map.pitch=66;map.safetyMargin=44;
        for(int i=0;i<=960;++i) {
            const double t=double(i)/960,a=-.30+2*pi*2.15*t,r=310-200*t;
            map.path.push_back({r*std::cos(a),r*std::sin(a)});
        }
        map.launcher={0,0};
    } else throw std::invalid_argument("未知地图");
    measure(map);
    // Do not collapse the two-turn spiral to the level's logical capacity.
    // Its physical path can contain unused space while MAX_LENGTH stays authoritative.
    const double required=map.diameter*2+(capacity+1)*map.pitch;
    const double scale=id=="spiral"?std::max(1.0,required/map.distances.back()):total/map.distances.back();
    if(id!="straight") {
        for(auto& p:map.path) {p.x*=scale;p.y*=scale;}
        map.launcher.x*=scale;map.launcher.y*=scale;
    }
    double minX=map.launcher.x-85,maxX=map.launcher.x+85,minY=map.launcher.y-45,maxY=map.launcher.y+110;
    for(auto p:map.path) {minX=std::min(minX,p.x);maxX=std::max(maxX,p.x);minY=std::min(minY,p.y);maxY=std::max(maxY,p.y);}
    const double pad=map.safetyMargin;
    for(auto& p:map.path) {p.x+=pad-minX;p.y+=pad-minY;}
    map.launcher.x+=pad-minX;map.launcher.y+=pad-minY;
    map.width=maxX-minX+2*pad;map.height=maxY-minY+2*pad;
    measure(map);return map;
}
AimResult resolveAim(const MapGeometry& map, std::size_t count, Point direction) {
    if(!std::isfinite(direction.x)||!std::isfinite(direction.y)||length(direction)<eps)
        throw std::invalid_argument("瞄准方向无效");
    direction=unit(direction);
    AimResult result;result.direction=direction;
    const Point origin=map.launcher;
    double nearest=std::numeric_limits<double>::infinity();
    const double radius=map.diameter/2;
    for(std::size_t i=0;i<count;++i) {
        const Point center=map.slot(i),relative=sub(center,origin);
        const double projection=dot(relative,direction),perp=dot(relative,relative)-projection*projection;
        if(perp>radius*radius+eps)continue;
        const double chord=std::sqrt(std::max(0.0,radius*radius-perp));
        const double t=projection-chord>=0?projection-chord:projection+chord;
        if(t<0||t>=nearest)continue;
        nearest=t;result.kind="ball";result.targetIndex=i;
        result.impact={origin.x+t*direction.x,origin.y+t*direction.y};
        // Closest point of the aim line to the center decides the divider side.
        const Point closest={origin.x+projection*direction.x,origin.y+projection*direction.y};
        const double side=dot(sub(closest,center),map.tangent(i));
        result.position=i+(side>=-eps?2:1);
    }
    // Adjacent center segments block rays even when their circles are missed.
    for(std::size_t i=0;i+1<count;++i) {
        const Point a=map.slot(i),b=map.slot(i+1),segment=sub(b,a),relative=sub(a,origin);
        const double denominator=cross(direction,segment);
        if(std::abs(denominator)<eps)continue;
        const double t=cross(relative,segment)/denominator,u=cross(relative,direction)/denominator;
        if(t<0||u<0||u>1||t>=nearest-eps)continue;
        nearest=t;result.kind="gap";result.targetIndex=i;result.position=i+2;
        result.impact={origin.x+t*direction.x,origin.y+t*direction.y};
    }
    if(result.kind=="spit") {
        // End when the leading edge of the ball touches the stage boundary.
        const double x=direction.x>eps?(map.width-radius-origin.x)/direction.x:direction.x<-eps?(radius-origin.x)/direction.x:std::numeric_limits<double>::infinity();
        const double y=direction.y>eps?(map.height-radius-origin.y)/direction.y:direction.y<-eps?(radius-origin.y)/direction.y:std::numeric_limits<double>::infinity();
        const double t=std::min(x,y);result.impact={origin.x+t*direction.x,origin.y+t*direction.y};
    }
    result.destination=result.kind=="spit"?result.impact:map.slot(result.position-1);
    return result;
}
}
